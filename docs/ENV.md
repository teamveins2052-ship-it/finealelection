# Environment files

All real values are **private** (git-ignored, excluded from uploads by `.vercelignore`).
Only the templates marked "in GitHub" are committed. Every app env file uses the same
numbered sections (1 Firebase web · 2 server access · 3 2-step key · 4 site address ·
5 Brevo · 6 other · 7 optional), so they're easy to compare.

| File | In GitHub? | Used by | Purpose |
|---|---|---|---|
| `.env.example` | yes | people setting up | Template: every setting, explained, no values |
| `.env.local` | no | `npm run dev` / `build` / `start` | **Active** settings. Never edit by hand — switch with the commands below |
| `.env.local.real` | no | `npm run env:real` | Local site against the **real** Firebase (live data) |
| `.env.local.emulator` | no | `npm run env:test` | Local site against the **test** emulators (fake data) |
| `.env.vercel` | no | Vercel → Settings → Environment Variables | Production settings to paste into Vercel (site address = Vercel URL) |
| `.env.bootstrap` | no | `npm run bootstrap`, `npm run ops:*` | Operator scripts for the real project (key file path, admin, dates) |
| `.env.bootstrap.example` | yes | — | Template for `.env.bootstrap` |
| `.env.seed` | yes | `npm run seed`, `seed:reset` | Emulator-only seed config (no secrets) |
| `functions/.env.election2026-2014a` | no | `firebase deploy --only functions` | Only if the project ever moves to the Blaze plan (Cloud Functions) |
| `functions/.env.example` | yes | — | Template for the file above |

## Switching the local site

```bash
npm run env:real    # real Firebase (live data)
npm run env:test    # test emulators (start them with: npm run emulators, then npm run seed)
npm run build && npm start
```

## After deploying

Open `https://<your-site>/api/health` — it must say `"healthy": true`. It lists any missing
setting by name (never its value).
