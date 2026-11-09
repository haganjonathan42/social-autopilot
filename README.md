# social-autopilot

A small Next.js app on Vercel that collects daily social drafts, lets you review
them, and publishes them to Facebook, Instagram, LinkedIn and X.

**The app never calls the Claude API.** Drafts are written by a daily Claude
scheduled task running on your own subscription, and pushed into the app. The app
only stores, shows and publishes them.

## How it works

```
Daily Claude scheduled task
        |
        |-- A. POST /api/drafts  (Bearer token)        -- preferred
        |
        '-- B. commit JSON into /drafts on GitHub      -- backup
                     |
                     '-- cron every 15 min -> /api/cron/import-drafts
                                   |
                              Postgres (Neon)
                                   |
                           /dashboard (password)
                        Approve / Edit / Reject, optional time
                                   |
                     publish now ---+--- cron every 5 min
                                   |      /api/cron/publish-due
                                   v
              Facebook Page · Instagram Business · LinkedIn · X
                                   |
                            publish_logs -> shown on the dashboard
```

Path B exists because the scheduled task's network may only be able to reach
GitHub. The repo is public, so the importer reads it without credentials;
setting `GITHUB_TOKEN` anyway raises the GitHub API rate limit from 60 calls an
hour to 5000. Either path produces the same `pending` draft, and nothing is published
until you approve it.

## Routes

| Route | Auth | What it does |
| --- | --- | --- |
| `POST /api/drafts` | `Authorization: Bearer $INTAKE_TOKEN` | Draft intake. One object or an array of up to 20. |
| `GET /api/cron/import-drafts` | `$CRON_SECRET` | Imports new JSON files from the repo's `/drafts` folder. |
| `GET /api/cron/publish-due` | `$CRON_SECRET` | Publishes approved drafts whose scheduled time has passed. |
| `POST /api/admin/migrate` | `$CRON_SECRET` | Creates/updates the database tables. Idempotent. |
| `GET /api/health` | none | Liveness, plus which credentials are present (never their values). |
| `/dashboard` | password | Review and publish. |

Cron endpoints accept the secret either as `Authorization: Bearer <secret>`
(which is how Vercel Cron sends it) or as `?secret=<secret>`, so an external
scheduler can call them too.

## Setup

[DEPLOY.md](DEPLOY.md) is the step-by-step checklist, including each
platform's credentials. The short version:

### 1. Database

Add Postgres to the Vercel project (Storage -> Neon / Vercel Postgres). It sets
`DATABASE_URL` for you. Then create the tables once:

```bash
curl -X POST "https://<your-app>.vercel.app/api/admin/migrate?secret=$CRON_SECRET"
```

### 2. Environment variables

Copy `.env.example` into Vercel's Environment Variables, filling in real values.
Nothing secret belongs in the repo. The minimum to get going with Facebook:

```
DATABASE_URL
INTAKE_TOKEN
DASHBOARD_PASSWORD
SESSION_SECRET
CRON_SECRET
GITHUB_REPO=haganjonathan42/social-autopilot
ENABLED_PLATFORMS=facebook
FACEBOOK_PAGE_ID
FACEBOOK_PAGE_ACCESS_TOKEN
```

Generate the secrets:

```bash
openssl rand -base64 48
```

### 3. Platforms, one at a time

`ENABLED_PLATFORMS` is the switch. Only platforms listed there are published to,
so you can run Facebook alone today and add the rest as their credentials start
working. A draft with no text for an enabled platform is recorded as skipped, not
failed.

**Facebook Page.** Create a Meta app, add your Page, and get a long-lived Page
access token with `pages_manage_posts` and `pages_read_engagement`. Set
`FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN`, then add `facebook` to
`ENABLED_PLATFORMS`. Free.

**Instagram Business.** Same Meta app. The account must be a Business or Creator
account linked to the Page. Set `INSTAGRAM_USER_ID` (the numeric account id). The
Page token usually works, so `INSTAGRAM_ACCESS_TOKEN` can stay empty. Instagram
has no text-only post, so a draft needs an `imageUrl`. Free.

**LinkedIn.** A personal profile works today: a member token with
`w_member_social`, plus `LINKEDIN_AUTHOR_URN=urn:li:person:XXXX`. A company page
needs `urn:li:organization:XXXX` and `w_organization_social`, which LinkedIn only
grants through the Community Management API programme — apply for that before
expecting company-page posting to work. Free.

**X.** Pay-per-use: roughly $0.015 a post, and roughly $0.20 for a post that
contains a link. So the app keeps the post itself link-free and sends `linkUrl`
as a reply. Set the four OAuth 1.0a values from the X developer portal
(`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`). Set
`X_LINK_IN_REPLY=false` if you would rather pay to inline the link.

### 4. Cron jobs — check your Vercel plan

`vercel.json` asks for every 15 minutes (import) and every 5 minutes (publish).

**Vercel's Hobby plan only runs cron jobs once a day**, and does not promise a
punctual run — a job set for 01:00 fires somewhere in the 01:00 hour. A deploy
whose `vercel.json` asks for more than that is rejected. On Hobby, either
upgrade to Pro, or delete the `crons` block and point an external scheduler
(cron-job.org, GitHub Actions, your own machine) at the two endpoints:

```bash
curl "https://<your-app>.vercel.app/api/cron/import-drafts?secret=$CRON_SECRET"
curl "https://<your-app>.vercel.app/api/cron/publish-due?secret=$CRON_SECRET"
```

The dashboard also has an **Import from GitHub now** button, so Path B works
without any scheduler at all.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run db:push              # create the tables
npm run dev
```

Then open http://localhost:3000 — it redirects to the dashboard, which asks for
`DASHBOARD_PASSWORD`.

## Draft format

See [DRAFTS.md](DRAFTS.md). That file is the contract for the scheduled task;
point the task at it.

## Notes on behaviour

- Drafts arrive `pending`. Nothing publishes without approval.
- Approving with no time, or a time in the past, publishes immediately.
  Approving with a future time hands the draft to the publish cron.
- Publishing claims the draft with a conditional `UPDATE`, so two overlapping
  cron runs cannot publish the same draft twice.
- Each platform publishes independently: one failure never stops the others. The
  draft ends up `published`, `partial` or `failed`, and every attempt — success,
  failure or skip — is written to `publish_logs` and shown under the draft.
- A GitHub file is imported exactly once; its path is its identity. Editing the
  file afterwards does not change the draft.
