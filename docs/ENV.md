# Environment files

All real values are **private** (git-ignored, excluded from uploads by `.vercelignore`).
Only the templates marked "in GitHub" are committed. Every env file uses the same numbered
sections (1 Supabase browser · 2 Supabase server · 3 2-step key · 4 site address · 5 Brevo ·
6 other · 7 optional), so they're easy to compare.

| File | In GitHub? | Used by | Purpose |
|---|---|---|---|
| `.env.example` | yes | people setting up | Template: every setting, explained, no values |
| `.env.local` | no | `npm run dev` / `build` / `start`, `npm run ops:*`, `npm run db:apply` | Local site + operator scripts against the Supabase project |
| `.env.vercel` | no | Vercel → Settings → Environment Variables | Production settings (site address = Vercel URL, DB = transaction pooler 6543) |

Keys are also kept outside the project in `C:\Users\uttup\secrets\supabase.env`.

## After deploying

Open `https://<your-site>/api/health` — it must say `"healthy": true`. It lists any missing
setting by name (never its value).
