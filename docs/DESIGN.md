# NIAT Campus Elections 2026 — Design Spec (DESIGN.md)

> Companion to `PRD.md`. Covers the design system, every screen, all states, motion, copy and accessibility.
> **Stack:** Tailwind CSS + shadcn/ui + lucide-react + Framer Motion (`motion`) · **Primary target:** mid-range Android, 360–414 px wide, campus Wi-Fi/4G.

---

## 1. Design Principles

1. **Voting is sacred, everything else is decoration.** The path *dashboard → position → vote → confirm* is the fastest, calmest, most obvious part of the app. Campaign content never blocks it.
2. **Trust over flash.** Clear locks, receipts, ticks and plain language ("Your vote is recorded and can't be changed"). Nothing ambiguous around a vote.
3. **One thing per screen on mobile.** Big tap targets, one primary action, no clutter even with 30+ features.
4. **Feels alive, never jumpy.** Numbers animate, cards don't shift. Skeletons, not spinners. No layout shift (CLS ≈ 0).
5. **Campus energy.** Bold, youthful, shareable — but the admin panel is quiet, dense and professional.

---

## 2. Brand & Visual Language

**Name on screen:** `NIAT Elections '26` · **Tagline:** "Your campus. Your vote."
**Personality:** confident, energetic, fair.
**Visual motif:** a ballot "tick" (✓) inside a rounded square — used as logo mark, completion stamp, and badge base.

> ⚠️ Use the official NIAT logo only with the college's permission; otherwise use the tick mark + wordmark.

---

## 3. Design Tokens

> **Theme update (14 Nov 2026) — "Paper & Ink".** Overrides §3.1 colours and §3.2 fonts below; the live values are in `app/globals.css`.
> - Colours: bg `#F2F1EC` (warm paper) · surface `#FBFAF7` · surface-2 `#E9E8E2` · border `#DCDAD3` · text/ink/primary `#111111` · muted `#5C5B56` · accent `#8A6400` (readable mustard) · highlight `#F1DC9A` (soft yellow fill) · success `#2E7D4F` · warning `#9A6A00` · danger `#C63D33` · info `#2F5F9E`. Dark: bg `#121211`, surface `#1B1B19`, text/primary `#F2F1EC`, accent `#E9C86B`.
> - Fonts: display **Bowlby One** (chunky poster lettering, single weight, never faux-bolded) · body **Nunito** 400–900 · receipts JetBrains Mono.
> - Buttons: pill "stickers" — primary = ink fill with a paper gap + hard ink offset shadow; secondary/outline = paper fill, 2 px ink border, `3px 4px 0` ink shadow; uppercase, extra-bold; press collapses the shadow. Inputs: 2 px ink border, radius 12–16. Cards: soft grey blob shadow (like figures' shadows).
> - LIVE indicator: small red dot + ink label. Club colours unchanged (thin borders/tints only).


### 3.1 Colour (CSS variables, `globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F7F7FB` | `#0B0B12` | App background |
| `--surface` | `#FFFFFF` | `#14141F` | Cards, sheets |
| `--surface-2` | `#F0F0F7` | `#1C1C2A` | Inputs, chips, nested |
| `--border` | `#E4E4EE` | `#2A2A3A` | Hairlines |
| `--text` | `#11111A` | `#F2F2F7` | Primary text |
| `--text-muted` | `#5E5E73` | `#A0A0B4` | Secondary text |
| `--primary` | `#5B3DF5` | `#7C66FF` | Primary actions, active states (electric violet) |
| `--primary-fg` | `#FFFFFF` | `#FFFFFF` | Text on primary |
| `--accent` | `#FF5A36` | `#FF7A5C` | Live indicators, reactions, highlights (coral) |
| `--success` | `#12B76A` | `#32D583` | Voted ✓, resolved |
| `--warning` | `#F79009` | `#FDB022` | Pending, paused |
| `--danger` | `#E5484D` | `#FF6369` | Errors, destructive admin actions |
| `--info` | `#2E90FA` | `#53B1FD` | Info banners |

**Club colours** (used as a thin top border + icon tint on position cards, never as large fills):

| Club | Colour | Icon (lucide) |
|---|---|---|
| NSGC | `#5B3DF5` violet | `Landmark` |
| Sports | `#12B76A` green | `Trophy` |
| Media | `#FF5A36` coral | `Camera` |
| GenAI | `#0BA5EC` sky | `Sparkles` |
| Cultural | `#EE46BC` pink | `Music` |
| Tech | `#F79009` amber | `Code2` |
| Other/new | `#667085` slate | `Users` |

Admin can pick a colour per position from this palette (stored on `positions/{id}.color`).

**Contrast rule:** all text ≥ 4.5:1 on its background; large numbers ≥ 3:1. Never place text on club colours.

### 3.2 Typography

| Role | Font | Size / line-height | Weight |
|---|---|---|---|
| Display (counters, hero) | **Space Grotesk** | 40/44 mobile · 56/60 desktop | 700 |
| H1 | Space Grotesk | 28/34 | 700 |
| H2 | Space Grotesk | 22/28 | 600 |
| H3 | Inter | 18/24 | 600 |
| Body | **Inter** | 16/24 | 400 |
| Body-sm | Inter | 14/20 | 400 |
| Caption / labels | Inter | 12/16 | 500, +0.02em |
| Numbers (tallies, receipts) | Space Grotesk, `tabular-nums` | — | 600–700 |
| Receipt code | JetBrains Mono | 18/24 | 600 |

Load via `next/font` (self-hosted, `display: swap`, subsets latin only) — zero layout shift.

### 3.3 Spacing, Radius, Elevation

- **Spacing scale (px):** 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 72. Screen gutter **16 px** mobile, 24 px tablet, 32 px desktop.
- **Radius:** `sm 8` (chips, inputs) · `md 12` (buttons) · `lg 16` (cards) · `xl 24` (sheets, hero) · `full` (avatars, pills).
- **Shadows:** light mode only — `card: 0 1px 2px rgb(16 16 40 / .06), 0 4px 12px rgb(16 16 40 / .04)`; `raised: 0 8px 24px rgb(16 16 40 / .10)`. Dark mode uses borders + `--surface-2`, no shadows.
- **Tap targets:** min **44 × 44 px**; vote buttons 52 px tall.

### 3.4 Breakpoints & Layout

| Name | Width | Layout |
|---|---|---|
| `base` | < 640 | Single column, bottom tab bar |
| `sm` | ≥ 640 | Single column, wider cards |
| `md` | ≥ 768 | 2-col nominee grids |
| `lg` | ≥ 1024 | Top nav, 3-col grids; admin sidebar |
| `xl` | ≥ 1280 | Max content width 1200 px, centred |

### 3.5 Motion

| Token | Value | Use |
|---|---|---|
| `fast` | 120 ms ease-out | Hover, press, toggle |
| `base` | 200 ms `cubic-bezier(.2,.8,.2,1)` | Sheets, cards, tabs |
| `slow` | 400 ms same curve | Page enter, results reveal |
| `count` | 600 ms ease-out | Number tick-up on tallies |

- Press feedback: `scale(.97)` on buttons/cards.
- Ranking change: nominee rows reorder with Framer `layout` animation (no jump).
- Respect `prefers-reduced-motion`: disable confetti, counters jump directly, reorder without animation.

### 3.6 Iconography & Imagery
- **lucide-react**, 20 px default, 1.75 stroke. Never mix icon sets.
- Nominee photos: square crop 1:1 for avatars, 4:5 for posts, 9:16 for stories. Always `next/image`, blur placeholder, `sizes` set.
- Fallback avatar: initials on club-colour tint.

---

## 4. Components

| Component | Notes |
|---|---|
| **Button** | Variants: `primary`, `secondary`, `ghost`, `destructive`, `google` (white + Google G). Sizes 40 / 48 / 52. Loading = inline spinner + disabled, label stays (no width jump). |
| **Input** | 48 px, label above, helper/error below. NIAT ID input: uppercase auto, monospace, `inputMode="text"`, pattern hint `N25H01A0693`. |
| **PositionCard** | Club colour top border (4 px), icon, title, "3 nominees", status chip: `Not voted` / `Voted ✓` / `Closed`. Whole card tappable. |
| **NomineeRow** (ranking) | Rank #, avatar 48, name, batch, vote count (tabular), % bar (club colour at 70% opacity), reaction count. Leader gets a subtle crown icon. |
| **NomineeCard** (grid) | Avatar 4:5, name, one-line promise, live count chip, "View profile" + "Vote" buttons. |
| **VoteBar** | Animated horizontal bar, width = %, label right-aligned. `aria-valuenow`. |
| **ConfirmSheet** | Bottom sheet (mobile) / dialog (desktop). Nominee avatar + name + position, warning line, `Confirm vote` primary, `Go back` ghost. |
| **ReceiptCard** | Big ✓ animation, receipt code in mono with copy button, timestamp, "Share badge" button. |
| **ProgressRing** | "4 / 7 voted" ring in header + linear version on dashboard. |
| **Banner** | Full-width, dismissible per session; variants `info`, `warning`, `success`, `image`. |
| **LiveDot** | 8 px coral pulsing dot + "LIVE" caption for real-time numbers. |
| **StoryRing** | Avatar with gradient ring (violet→coral) when nominee has active stories; grey when seen. |
| **Toast** | Bottom-centre on mobile, top-right on desktop; 4 s; success/error/offline. |
| **Skeleton** | Matches final layout exactly (same heights) to keep CLS 0. |
| **EmptyState** | Icon + one line + optional action. |
| **StatusChip** | `active` green, `pending` amber, `disabled` grey, `open` blue, `resolved` green. |
| **DataTable** (admin) | shadcn table + sticky header, search, filters, pagination 50/page, CSV export. |
| **StatCard** (admin) | Label, big number, delta, mini sparkline. |

---

## 5. Navigation

**Student (mobile bottom tabs, 4 items):** `Home` · `Vote` · `My Votes` · `Profile`
- Header: logo, ProgressRing, countdown chip ("Closes in 05:12:44"), notifications bell (nominees only), theme toggle in Profile.
- Desktop: same items as top nav.

**Nominee:** student tabs + a 5th tab `Studio` (only visible when `isNominee`).

**Admin (desktop-first sidebar, collapses to drawer on mobile):**
`Overview` · `Results` · `Voters` · `Students` · `Requests (badge count)` · `Positions & Nominees` · `Content` · `Banners` · `Reminders` · `Analytics` · `Audit Log` · `Export` · `Settings`

---

## 6. Screen Specs

### 6.1 Landing `/`
```
┌─────────────────────────────┐
│ ✓ NIAT Elections '26   ☾    │
│ [Banner: Voting opens 19 Nov 9 AM]       │
│                             │
│   Your campus. Your vote.   │
│   ● LIVE  1,243 votes cast  │  ← animated counter
│   "Someone just voted in    │  ← ticker, rotates every 3 s
│    Media Club"              │
│   ▓▓▓▓▓▓▓░░░  82% turnout   │
│                             │
│   Closes in 05:12:44        │
│  ┌───────────────────────┐  │
│  │ Enter your NIAT ID    │  │
│  └───────────────────────┘  │
│  [ Continue  → ]            │
│                             │
│  Positions this year (chips)│
│  Privacy note · Help        │
└─────────────────────────────┘
```
- Pre-voting: counter replaced by "Voting opens in 2d 14h". Closed: "Results are out →".
- After 23 Nov: full-screen "Election concluded. Thank you!" with final turnout.

### 6.2 Login — step 1: details check `/login`
- Card: name (full), batch, **masked** email `t*****@gmail.com`, masked phone `******4321`, admission no. masked except last 3.
- Heading: "Is this you?"
- Primary: `Yes, that's me` · Link: `Something's wrong`.
- ID not found: inline error + "Request to be added" link.

### 6.3 Login — step 2: verify `/login/verify`
- `Continue with Google` (primary, white style) — subtext "Use t*****@gmail.com".
- Divider "or".
- `Email me a sign-in link` (secondary) → success state: envelope illustration, "Check t*****@gmail.com — the link expires in 1 hour", resend in 60 s countdown.
- Mismatch error: "This Google account isn't the one registered for N25H01A0693. Use t*****@gmail.com or request a correction."

### 6.4 Correction request `/login/request`
- Fields: what's wrong (checkboxes: name, email, phone, admission no.), correct value(s), note (optional).
- Submit → **Pending screen**: amber hourglass, "Your request is with the admin. You'll get an email when it's fixed. Login is paused until then." Shows submitted time + request ID.

### 6.5 Dashboard `/dashboard` (Vote tab)
```
Hi Tarun 👋              ◔ 4/7
[Banner]
Closes in 05:12:44 ●LIVE
─────────────────────────────
▣ Sports Club President   Voted ✓
▣ Media Club Head         Not voted →
▣ NSGC Representative     Not voted →
...
─────────────────────────────
[Your badges] [Predictions] [Today's poll]
```
- Unvoted positions sorted first. Voted cards dim slightly (80% opacity) with green ✓ chip.
- All voted → celebration card at top: "You voted in all 7 clubs 🎉 Share your badge".
- Paused: amber banner pinned "Voting is paused by the election committee. Your votes are safe." Vote buttons disabled.

### 6.6 Position `/vote/[positionId]`
- Header: club icon + title, total votes ●LIVE, "Compare" button.
- Ranked list of `NomineeRow`s (live, reorder animated).
- Sticky bottom bar (if not voted): "Tap a nominee to view and vote".
- If voted: green strip "You voted for Ravi K · Receipt SP-7K3M".
- Debate tab (if exists): question + answers side by side (horizontal scroll on mobile).

### 6.7 Compare `/vote/[positionId]/compare`
- Mobile: horizontally swipeable columns (snap), each with avatar, top 3 promises, live count, `Vote` button.
- Desktop: up to 4 columns side by side; rows aligned (bio, promises, posts count, reactions).

### 6.8 Nominee profile `/nominee/[id]`
```
┌─────────────────────────────┐
│  ( avatar w/ story ring )   │
│  Ravi K · Batch 2025        │
│  Sports Club President      │
│  ●LIVE 401 votes · 49%      │
│  🔥 230  👏 112             │
│  [ Vote for Ravi ]          │  ← primary, sticky on scroll
├─────────────────────────────┤
│ Bio | If I win | Posts | Q&A│  ← tabs
│  ...                        │
└─────────────────────────────┘
```
- **If I win:** numbered promise list (max 6), large readable type.
- **Posts:** 3-col grid (1:1 thumbs), tap → full-screen viewer, videos tap-to-play, muted by default.
- **Stories:** tap avatar → full-screen 9:16 viewer, progress bars at top, tap left/right, hold to pause, swipe down to close.
- **Q&A:** "Ask anonymously" input (shows lock icon + "Ravi won't see your name"), answered questions first.
- Comments sheet on posts: same anonymous lock note.

### 6.9 Vote confirm (sheet)
- Avatar 72, "Vote for **Ravi K** as **Sports Club President**?"
- Warning row (amber icon): "This is final. You can't change or undo your vote."
- `Confirm vote` (primary, 52 px) · `Go back`.
- On tap: button shows spinner → success replaces sheet content with **ReceiptCard** (✓ draw animation 400 ms, light haptic `navigator.vibrate(30)` where supported).
- Offline: "You're offline — your vote is saved and will submit automatically" + amber clock icon; card shows `Submitting…` until confirmed.

### 6.10 My Votes `/my-votes`
- List: position, chosen nominee avatar + name, time, receipt code (mono, copy).
- Pending positions listed below with `Vote now →`.
- Badges strip: earned badges (tap → share).

### 6.11 Results `/results` (locked until published)
- Locked state: lock illustration + "Results unlock when voting closes · 20 Nov, 5:00 PM".
- Unlocked: per position winner hero (avatar 120, crown, %, votes), runner-ups below with bars. Confetti once per session (respect reduced motion). `Share results` → image.
- Prediction score card: "You predicted 5/7 correctly · Rank #42".

### 6.12 Profile `/profile`
- Read-only details (full), lock icons, "Something wrong? Request a correction".
- Theme toggle (System / Light / Dark), Install app (PWA), Log out, Privacy note.

### 6.13 Nominee Studio `/studio`
- Checklist card: Photo ✓ · Bio ✓ · Promises ◯ · First post ◯ (gamifies setup).
- Sections: Profile (photo crop tool 1:1, bio 300 chars, promises up to 6 × 120 chars), Posts (upload with progress, caption 200 chars), Stories (upload, 24 h timer), Q&A inbox (unanswered first, reply inline), Debate answers, Stats (views, reactions, questions — **no vote breakdown by person**).
- Preview button: "See as voters see it".
- Locked after voting closes: read-only with notice.
- Upload limits shown inline: images ≤ 2 MB (auto-compressed client-side), videos ≤ 30 s.

### 6.14 Share images (generated, 1080 × 1920 story + 1080 × 1080 square)
- **I voted badge:** gradient bg (violet→coral), big tick mark, "I VOTED" in Space Grotesk 120, club name + icon, student first name, "NIAT Elections '26". No nominee name (keeps the vote secret).
- **All clubs badge:** same, with 7 club icons in a ring.
- **Results card:** winner avatar, position, %, "Congratulations".

---

## 7. Admin Panel Design

**Tone:** quiet, dense, neutral greys; colour only for status and charts. Desktop-first, usable on tablet.

| Page | Key layout |
|---|---|
| **Overview** | StatCards: Total students · Voted · Not voted · Turnout % · Votes/min · Open requests. Below: per-position mini results, live activity feed, health card (last vote, failed writes). Emergency **Pause voting** button top-right (red outline, confirm modal requiring typing `PAUSE`). |
| **Results** | Tabs per position; bars + table; click nominee → voter list. |
| **Voters (who voted for whom)** | Filter by position + nominee; table: NIAT ID, name, batch, time, receipt. Access banner: "Sensitive — every view is logged". |
| **Students** | DataTable with search; row drawer to edit email/phone/status; nominee toggle + position select. Import button → upload Excel → preview table with validation errors highlighted → `Import 1,498 students`. |
| **Requests** | Kanban-ish list: Open / Resolved / Rejected; side panel shows current vs requested values, `Apply & resolve` primary. |
| **Positions & Nominees** | Drag-to-reorder positions; per position: nominee list, add via student search, active toggle; lock notice once voting opens. |
| **Content** | Moderation queue: posts, comments, questions; delete with reason; author visible to admin only. |
| **Banners** | List + editor (text/image, link, schedule start/end), live preview on a phone frame. |
| **Reminders** | Segment picker (not voted · juniors · specific position), preview count, email preview, daily-cap meter, `Send`. |
| **Analytics** | Votes per hour (line), turnout by batch (bar), participation by position (bar), device split. Recharts, club colours. |
| **Audit Log** | Filterable table (actor, action, target, time), infinite scroll, export. |
| **Export** | Buttons: Results (Excel/PDF), Voter list, Audit log, Correction requests. |
| **Settings** | Voting window (date-time pickers, IST shown), results publish toggle, nominee self-vote toggle, site shutdown date, admin list. Danger zone at bottom. |

---

## 8. States Matrix (every screen must handle)

| State | Treatment |
|---|---|
| Loading | Skeleton matching final layout |
| Empty | EmptyState with action (e.g. "No posts yet") |
| Error | Inline message + `Try again`; never a blank screen |
| Offline | Top slim bar "You're offline — changes will sync" |
| Pre-voting | Vote buttons hidden, countdown shown, profiles browsable |
| Voting open | Normal |
| Paused | Amber pinned banner, vote buttons disabled |
| Closed | "Voting has closed" chip, results teaser |
| Results published | Results tab highlighted with dot |
| Site concluded | Single thank-you page |
| Account pending | Pending screen only |
| Account disabled | "Contact the election committee" |
| Session kicked (other device) | Modal: "You were signed in on another device" → Sign in again |

---

## 9. Microcopy

| Moment | Copy |
|---|---|
| NIAT ID placeholder | `e.g. N25H01A0693` |
| ID not found | "We couldn't find that NIAT ID. Check for typos or request to be added." |
| Confirm vote | "This is final. You can't change or undo your vote." |
| Vote success | "Vote recorded ✓ Keep your receipt code." |
| Already voted | "You've already voted in this club." |
| Paused | "Voting is paused by the election committee. Your votes are safe." |
| Anonymous ask | "Your name is never shown to the nominee." |
| Pending account | "Your request is with the admin. You'll get an email when it's fixed." |
| Live counts note | "Counts update every few seconds." |
| Privacy note (login) | "Your vote count is anonymous to everyone except the election committee." *(adjust after committee sign-off)* |

Tone: short, plain English, second person, no jargon, no exclamation marks on serious moments (only on celebrations).

---

## 10. Accessibility (WCAG 2.1 AA)

- Contrast ≥ 4.5:1 text; focus ring 2 px `--primary` + 2 px offset on every interactive element.
- Full keyboard support; sheets trap focus; `Esc` closes.
- Vote bars: `role="progressbar"` with `aria-valuenow`/`aria-label`; live counters in `aria-live="polite"` region, **throttled to one announcement per 30 s**.
- Story/video viewer: pause control, captions field for nominees, no autoplay sound.
- Never rely on colour alone (✓ icon + text on voted state).
- Touch targets ≥ 44 px; text resizable to 200% without breaking.
- `lang="en"`, semantic headings in order, alt text required on nominee uploads (prompted in Studio).

---

## 11. Performance Budget (design-side rules)

| Metric | Target |
|---|---|
| LCP (landing, 4G mid Android) | < 2.0 s |
| CLS | < 0.05 |
| INP | < 200 ms |
| JS on voting path | < 150 KB gzipped |
| Images | WebP/AVIF, ≤ 150 KB per thumbnail |

- Admin, Studio, story viewer, confetti, charts → dynamically imported (never on the voting path).
- Videos: poster image first, load on tap.
- Fonts: 2 families max, self-hosted.
- Animate only `transform` and `opacity`.

---

## 12. PWA

- `manifest.json`: name "NIAT Elections '26", short name "NIAT Votes", theme `#5B3DF5`, background `#0B0B12`, icons 192/512 + maskable.
- Install prompt shown once on dashboard after first vote ("Add to home screen for quick access").
- Offline: app shell cached; vote queue handled by Firestore persistence.

---

## 13. Tailwind Config (starter)

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: { DEFAULT: "var(--surface)", 2: "var(--surface-2)" },
        border: "var(--border)",
        text: { DEFAULT: "var(--text)", muted: "var(--text-muted)" },
        primary: { DEFAULT: "var(--primary)", fg: "var(--primary-fg)" },
        accent: "var(--accent)",
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
        info: "var(--info)",
        club: {
          nsgc: "#5B3DF5", sports: "#12B76A", media: "#FF5A36",
          genai: "#0BA5EC", cultural: "#EE46BC", tech: "#F79009", other: "#667085",
        },
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jetbrains)", "ui-monospace", "monospace"],
      },
      borderRadius: { sm: "8px", md: "12px", lg: "16px", xl: "24px" },
      boxShadow: {
        card: "0 1px 2px rgb(16 16 40 / .06), 0 4px 12px rgb(16 16 40 / .04)",
        raised: "0 8px 24px rgb(16 16 40 / .10)",
      },
      transitionTimingFunction: { smooth: "cubic-bezier(.2,.8,.2,1)" },
      keyframes: {
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: ".35" } },
      },
      animation: { "pulse-dot": "pulseDot 1.4s ease-in-out infinite" },
    },
  },
} satisfies Config;
```

```css
/* app/globals.css */
:root {
  --bg:#F7F7FB; --surface:#FFFFFF; --surface-2:#F0F0F7; --border:#E4E4EE;
  --text:#11111A; --text-muted:#5E5E73;
  --primary:#5B3DF5; --primary-fg:#FFFFFF; --accent:#FF5A36;
  --success:#12B76A; --warning:#F79009; --danger:#E5484D; --info:#2E90FA;
}
.dark {
  --bg:#0B0B12; --surface:#14141F; --surface-2:#1C1C2A; --border:#2A2A3A;
  --text:#F2F2F7; --text-muted:#A0A0B4;
  --primary:#7C66FF; --accent:#FF7A5C;
  --success:#32D583; --warning:#FDB022; --danger:#FF6369; --info:#53B1FD;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration:.01ms !important; transition-duration:.01ms !important; }
}
```

---

## 14. Design QA Checklist (before 18 Nov freeze)

- [ ] Every screen checked at 360 px, 414 px, 768 px, 1280 px
- [ ] Light + dark mode on every screen
- [ ] All states from §8 visible and reachable
- [ ] Vote flow done one-handed in < 10 s per position
- [ ] No layout shift when tallies update
- [ ] Share images render correctly on WhatsApp + Instagram stories
- [ ] Keyboard-only run through login + vote
- [ ] Slow 3G throttle: landing usable, vote still submits
- [ ] Copy reviewed by one non-tech student
