# 30reach

Breakthirty's internal tool for competitor research and content planning. It pulls the public Instagram
and TikTok posts of a client's competitors, shows what works, and helps the team save ideas and plan
posts on a calendar. An assistant called Blip explains the data.

## Stack

| Part        | What we use                                                        |
| ----------- | ------------------------------------------------------------------ |
| App         | React, Vite, TypeScript, Tailwind CSS                              |
| Backend     | Supabase: Postgres, Auth (Google sign in), Storage, Edge Functions |
| Hosting     | Cloudflare Worker serving the static build                         |
| Social data | Firecrawl                                                          |
| Blip (AI)   | Groq                                                               |
| Holidays    | Nager.Date                                                         |

## How it fits together

```
 Browser (React app on Cloudflare)
   │  only the Supabase URL and publishable key live here
   │
   ├──▶ Supabase Postgres ── every table checks "is this a signed in team member?"
   ├──▶ Supabase Storage  ── thumbnails and idea images
   └──▶ Supabase Edge Functions (server side, hold the secret keys)
          ├──▶ Firecrawl   competitor posts, credit balance
          ├──▶ Groq        Blip's answers, plans, hooks, captions, health check
          └──▶ Nager.Date  public holidays
```

## What happens behind the scenes

* **Signing in.** Google sign in through Supabase. A database hook only lets in `@breakthirty.com`
  accounts, and every table has row level security, so a request without a team session gets nothing.
* **Pressing Refresh.** The browser asks an Edge Function to start a pull, then works through it one
  brand and platform at a time. Each step calls Firecrawl on the server and saves the posts. Nothing
  runs on a schedule: a pull only happens when someone presses the button. The last two pulls are kept
  so the app can show what changed.
* **Asking Blip.** The browser sends the question to an Edge Function. It builds a short summary of the
  saved pull (never the raw data) and asks Groq. Greetings and simple questions are answered in the
  browser without calling Groq at all.
* **The calendar.** Holidays come from Nager.Date, marketing dates and health months from rules in the
  code. AI ideas reach the calendar only when a person plans them.
* **Images.** Every uploaded image is shrunk in the browser before it's stored.

## Getting started

You need **Node 22** or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```

`.env.local` needs two variables. Ask the team for the values; never commit this file.

| Name                            | What it is                                          |
| ------------------------------- | --------------------------------------------------- |
| `VITE_SUPABASE_URL`             | The Supabase project URL                            |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The Supabase publishable key (safe for the browser) |

## Scripts

| Command             | What it does                                                         |
| ------------------- | -------------------------------------------------------------------- |
| `npm run dev`       | Local dev server                                                     |
| `npm run build`     | Typecheck, production build, then checks no dev only pages are in it |
| `npm run test`      | Unit tests (Vitest)                                                  |
| `npm run test:e2e`  | Browser tests and screenshots at 390, 768 and 1440 px (Playwright)   |
| `npm run lint`      | ESLint                                                               |
| `npm run typecheck` | TypeScript                                                           |
| `npm run format`    | Prettier                                                             |

## Supabase

The CLI is pinned in `package.json`, so use it through `npx`.

```bash
npx supabase login
npx supabase link                                # pick the project once

# Database changes: always preview first
npx supabase db push --remote --dry-run
npx supabase db push --remote

# Edge Functions (no Docker needed)
npx supabase functions deploy <name> --use-api

# Server secrets, by name (values come from the Firecrawl and Groq dashboards)
npx supabase secrets set FIRECRAWL_API_KEY=… GROQ_API_KEY=… GROQ_MODEL=…
```

`db` and `migration` commands target a local database unless you add `--remote`.

After a deploy, check that nothing is open to people who aren't signed in:

```bash
node --env-file=.env.local scripts/check-rls.mjs            # tables, functions, storage
node --env-file=.env.local scripts/check-pull-fns.mjs       # pulls
node --env-file=.env.local scripts/check-credits-fn.mjs     # credits
node --env-file=.env.local scripts/check-handle-fn.mjs      # handle check
node --env-file=.env.local scripts/check-holidays-fn.mjs    # holidays
node --env-file=.env.local scripts/check-ai-fns.mjs         # Blip functions
node --env-file=.env.local scripts/check-clear-pull-fn.mjs  # clear pull
```

## Deploy

Push to `main`. Cloudflare Workers Builds runs `npm run build` and serves `dist/`. Set two build
variables in the Cloudflare dashboard: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
Edge Functions and database changes are deployed separately with the Supabase commands above.

## Project structure

| Folder                | What's in it                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `src/app`             | Routes and the layout (sidebar, icon rail, phone tabs)               |
| `src/components`      | Shared UI: buttons, dialogs, toasts, Blip                            |
| `src/features`        | One folder per screen: overview, calendar, ideas, settings and so on |
| `src/lib`             | Supabase client, data hooks, formatting                              |
| `src/styles`          | Tailwind setup, design tokens, Blip animations                       |
| `supabase/migrations` | Database schema and security rules                                   |
| `supabase/functions`  | Edge Functions (shared code in `_shared`)                            |
| `e2e`                 | Playwright tests and screenshots                                     |
| `scripts`             | Security checks and small helpers                                    |
| `public`              | Fonts, favicons                                                      |

## Working rules

* **Free tiers only.** No paid services or anything that needs a credit card.
* **No secret keys in the browser.** Firecrawl and Groq keys live only in Supabase secrets.
* **Pulls are manual.** No schedules or automatic refreshes.
* **Responsive at 390, 768 and 1440 px.** Check all three before calling something done.
* **Conventional commits**, for example `feat(calendar): add week view` or `fix(ideas): keep draft`.

Internal docs (`CLAUDE.md`, `docs/`) are kept outside git.
