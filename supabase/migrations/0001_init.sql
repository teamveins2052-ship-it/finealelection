-- =====================================================================================
-- NIAT Elections '26 on Supabase (replaces Firestore + Realtime Database + Storage).
--
-- Design
--  * One table per former Firestore collection: (id text PK, data jsonb). The server code
--    (functions/src/lib/store.ts) keeps the same document semantics, so every guard, rate
--    limit and Zod check carried over unchanged. Timestamps inside `data` are {"$ts": millis}.
--  * Row Level Security is ON for every table with NO policies, so the browser (publishable
--    key) can read/write NOTHING directly. All reads/writes go through the guarded server
--    (/api/fn, /api/db) using the secret key — the same rules as the old firestore.rules,
--    now written in TypeScript (lib/server/rules.ts).
--  * Two tables are readable by browsers, for live updates over Supabase Realtime:
--      rt        — public live data (tallies, wall, election flags) — like the old RTDB
--      _changes  — "something changed" pings, NO data. Per-student keys are HMACs, so a
--                  ping can't be linked to a student (P-RTD-01).
--  * Votes are append-only at the database level too (AGENTS §5.2): a trigger blocks
--    deletes and any change to who/what/when once written.
-- Idempotent: safe to run again.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- private secret for ping keys ----------
create table if not exists public._secrets (name text primary key, value text not null);
alter table public._secrets enable row level security;
insert into public._secrets (name, value)
  values ('ping_key', encode(extensions.gen_random_bytes(32), 'hex'))
  on conflict (name) do nothing;

-- ---------- change pings ----------
create table if not exists public._changes (
  key text primary key,
  at  timestamptz not null default now()
);
alter table public._changes enable row level security;
drop policy if exists "_changes readable" on public._changes;
create policy "_changes readable" on public._changes for select to anon, authenticated using (true);

create or replace function public._user_key(niat text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select 'u:' || encode(extensions.hmac(niat, (select value from public._secrets where name = 'ping_key'), 'sha256'), 'hex');
$$;
revoke all on function public._user_key(text) from public, anon, authenticated;

create or replace function public._ping() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  owner text;
begin
  if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  insert into public._changes (key, at) values ('c:' || tg_table_name, now())
    on conflict (key) do update set at = excluded.at;
  owner := case tg_table_name
    when 'students'    then r->>'id'
    when 'predictions' then r->>'id'
    when 'votes'       then r->'data'->>'voterId'
    when 'reactions'   then r->'data'->>'niatId'
    when 'pulse_votes' then r->'data'->>'niatId'
    else null end;
  if owner is not null then
    insert into public._changes (key, at) values (public._user_key(owner), now())
      on conflict (key) do update set at = excluded.at;
  end if;
  return null;
end $$;

-- ---------- document tables ----------
do $$
declare
  t text;
  pinged text[] := array[
    'admins','students','correction_requests','positions','nominees','votes','tallies','posts',
    'questions','comments','question_authors','comment_authors','reactions','debates','predictions',
    'pulse_polls','pulse_votes','banners','settings','audit_logs','_mail_queue'];
  quiet text[] := array['directory','mfa','_mfa_sessions','_email_quota','_rate_limits','_meta','_events'];
begin
  foreach t in array pinged || quiet loop
    execute format('create table if not exists public.%I (
        id text primary key,
        data jsonb not null default ''{}''::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now())', t);
    execute format('alter table public.%I enable row level security', t);
  end loop;
  foreach t in array pinged loop
    execute format('drop trigger if exists _ping on public.%I', t);
    execute format('create trigger _ping after insert or update or delete on public.%I
                    for each row execute function public._ping()', t);
  end loop;
end $$;

-- ---------- indexes for the queries the app makes ----------
create index if not exists students_email   on public.students ((data->'email'));
create index if not exists students_status  on public.students ((data->'status'));
create index if not exists nominees_pos     on public.nominees ((data->'positionId'));
create index if not exists positions_order  on public.positions ((data->'order'));
create index if not exists votes_pos        on public.votes ((data->'positionId'), (data->'createdAt'));
create index if not exists votes_created    on public.votes ((data->'createdAt'));
create index if not exists posts_nominee    on public.posts ((data->'nomineeId'), (data->'createdAt'));
create index if not exists questions_nom    on public.questions ((data->'nomineeId'), (data->'createdAt'));
create index if not exists comments_post    on public.comments ((data->'postId'), (data->'createdAt'));
create index if not exists reactions_nom    on public.reactions ((data->'nomineeId'), (data->'type'));
create index if not exists audit_at         on public.audit_logs ((data->'at'));
create index if not exists requests_niat    on public.correction_requests ((data->'niatId'), (data->'status'));
create index if not exists requests_created on public.correction_requests ((data->'createdAt'));
create index if not exists mailq_status     on public._mail_queue ((data->'status'), (data->'createdAt'));
create index if not exists banners_starts   on public.banners ((data->'startsAt'));

-- ---------- votes are append-only (AGENTS §5.2, P-VOT-03) ----------
create or replace function public._votes_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'votes are append-only';
  end if;
  if new.id <> old.id
     or new.data->'voterId'    is distinct from old.data->'voterId'
     or new.data->'positionId' is distinct from old.data->'positionId'
     or new.data->'nomineeId'  is distinct from old.data->'nomineeId'
     or new.data->'createdAt'  is distinct from old.data->'createdAt'
     or (old.data->>'counted' = 'true' and new.data->>'counted' is distinct from 'true') then
    raise exception 'votes are append-only';
  end if;
  return new;
end $$;
drop trigger if exists votes_guard on public.votes;
create trigger votes_guard before update or delete on public.votes
  for each row execute function public._votes_guard();

-- ---------- public live data (replaces Firebase Realtime Database) ----------
create table if not exists public.rt (
  path text primary key,          -- top-level node: tallies | wall | election | pulse | predictionLeaderboard | meta
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.rt enable row level security;
drop policy if exists "rt public nodes" on public.rt;
create policy "rt public nodes" on public.rt for select to anon, authenticated
  using (path in ('tallies', 'wall', 'election', 'pulse', 'predictionLeaderboard'));

-- ---------- Realtime: only the two browser-readable tables ----------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rt') then
    alter publication supabase_realtime add table public.rt;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = '_changes') then
    alter publication supabase_realtime add table public._changes;
  end if;
end $$;

-- ---------- Storage: nominee photos/videos (public read; uploads only via server-signed URLs) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 26214400,
        array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;
