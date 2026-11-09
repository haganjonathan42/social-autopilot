# Deploy checklist

Work top to bottom. Stages 1–4 get you a running app with Facebook publishing;
stage 6 adds the other platforms whenever you are ready. Nothing below puts a
secret in the repo.

Where a third-party console is involved, the wording of buttons and menus
changes more often than the steps do — the thing you are looking for is named,
not the exact click path.

---

## 1. Database

- [ ] In the Vercel dashboard, open the project's **Storage** tab and attach a
      Postgres database (Neon).
- [ ] Confirm it set a connection string on the project. The app reads
      `DATABASE_URL`, and falls back to `POSTGRES_URL` because the integrations
      disagree about the name. If neither is set, copy the pooled connection
      string in by hand as `DATABASE_URL`.
- [ ] Use the **pooled** connection string, not the direct one. Serverless
      functions open a connection per invocation.

The tables get created in stage 4, once the app is deployed.

## 2. Secrets

Generate three random values — a different one for each:

```bash
openssl rand -base64 48
```

- [ ] `SESSION_SECRET` — signs the dashboard cookie.
- [ ] `CRON_SECRET` — guards the cron endpoints and the migrate endpoint. Vercel
      Cron sends this automatically once it is set.
- [ ] `INTAKE_TOKEN` — the bearer token your daily Claude task will send.
- [ ] `DASHBOARD_PASSWORD` — what you type to get into the dashboard. Pick
      something you will actually remember; there is no reset flow.

Add all four in **Settings → Environment Variables**, for Production (and
Preview, if you want previews to work).

## 3. First deploy

- [ ] Import `haganjonathan42/social-autopilot` at
      [vercel.com/new](https://vercel.com/new). Next.js is detected; the default
      build settings are correct.
- [ ] Add the remaining non-platform variables before deploying:
      - `GITHUB_REPO=haganjonathan42/social-autopilot`
      - `GITHUB_BRANCH=main`
      - `GITHUB_DRAFTS_PATH=drafts`
      - `ENABLED_PLATFORMS=facebook`
      - `GITHUB_TOKEN` — optional. The repo is public so the import works
        without it, but it lifts the GitHub API limit from 60 calls an hour to
        5000, which matters at a 15-minute cadence.
- [ ] Deploy, and note the production URL.

## 4. Create the tables, then check the wiring

- [ ] Create the schema (idempotent, safe to repeat):

```bash
curl -X POST "https://<your-app>.vercel.app/api/admin/migrate?secret=<CRON_SECRET>"
```

Expect `{"ok":true,"message":"schema is up to date"}`.

- [ ] Check what the app can see. This reports which credentials are present,
      never their values:

```bash
curl "https://<your-app>.vercel.app/api/health"
```

Expect `"database":"ok"`. If it reports an error here, nothing downstream will
work — fix it before going on.

- [ ] Sign in at `https://<your-app>.vercel.app/dashboard` with
      `DASHBOARD_PASSWORD`.
- [ ] Send a test draft end to end:

```bash
curl -X POST "https://<your-app>.vercel.app/api/drafts" \
  -H "Authorization: Bearer <INTAKE_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"topic":"Test draft","facebook":"Testing social-autopilot."}'
```

Expect `201` and `{"ok":true,"created":[1],...}`, and the draft waiting in the
dashboard. Reject it when you are done looking.

## 5. Scheduling — check your plan first

`vercel.json` asks for the import every 15 minutes and the publish check every
5 minutes.

- [ ] **On Pro**, nothing to do: the schedules deploy as written.
- [ ] **On Hobby**, cron runs at most **once a day**, and not at a predictable
      minute — a job set for 01:00 fires somewhere in the 01:00 hour. A deploy
      asking for more is rejected outright. So either upgrade, or delete the
      `crons` block from `vercel.json` and point an external scheduler
      (cron-job.org, a GitHub Actions workflow, your own machine) at:

```bash
curl "https://<your-app>.vercel.app/api/cron/import-drafts?secret=<CRON_SECRET>"
```

```bash
curl "https://<your-app>.vercel.app/api/cron/publish-due?secret=<CRON_SECRET>"
```

Without a scheduler, Path B still works through the dashboard's **Import from
GitHub now** button, and approving a draft with no time publishes it on the
spot. Only *scheduled* publishing needs the cron.

- [ ] Verify the import endpoint by hand once. A wrong folder path is reported
      as `"folderMissing":true` rather than a silent zero.

## 6. Platforms

`ENABLED_PLATFORMS` is the switch — a comma-separated list. Only what is listed
publishes, so add each platform once its credentials work.

### Facebook Page — do this one first

- [ ] Create an app at
      [developers.facebook.com](https://developers.facebook.com/apps) of type
      **Business**.
- [ ] In the Graph API Explorer, pick your app, and request a **User** token
      with `pages_show_list`, `pages_manage_posts` and `pages_read_engagement`.
- [ ] Call `GET /me/accounts`. The response lists the Pages you administer, each
      with its `id` and its own `access_token`.
- [ ] Exchange for a long-lived token, then re-fetch `/me/accounts`. A Page
      token derived from a long-lived user token does not expire on a timer, but
      it does die if you change your password or revoke the app — so if posting
      suddenly 401s months from now, this is the first thing to check.
- [ ] Set `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_ACCESS_TOKEN`.
- [ ] Set `ENABLED_PLATFORMS=facebook`, redeploy, approve a real draft.

While the app is in Development mode you can post to a Page you administer with
your own token. App Review is only needed for *other people's* accounts, which
this app never touches.

### Instagram Business

- [ ] The account must be **Business or Creator**, and linked to the Facebook
      Page above. A personal account cannot publish through the API at all.
- [ ] Add `instagram_basic` and `instagram_content_publish` to the token's
      permissions.
- [ ] Get the account id: `GET /<FACEBOOK_PAGE_ID>?fields=instagram_business_account`.
      That numeric id — not the @handle — is `INSTAGRAM_USER_ID`.
- [ ] Leave `INSTAGRAM_ACCESS_TOKEN` empty unless the Page token does not work;
      the app falls back to `FACEBOOK_PAGE_ACCESS_TOKEN`.
- [ ] Add `instagram` to `ENABLED_PLATFORMS`.

Instagram has no text-only post. A draft without `imageUrl` is logged as
*skipped*, not failed — so if Instagram seems to do nothing, check that the
draft carries a public `https` image URL.

### LinkedIn

- [ ] Create an app at
      [linkedin.com/developers](https://www.linkedin.com/developers/apps), tied
      to a company page you control (LinkedIn requires one even for personal
      posting).
- [ ] Request the **Share on LinkedIn** and **Sign In with LinkedIn using
      OpenID Connect** products.
- [ ] Get a member token with `w_member_social`, plus `openid profile` so you
      can read your own id.
- [ ] Call `GET /v2/userinfo`. The `sub` field is your member id; set
      `LINKEDIN_AUTHOR_URN=urn:li:person:<sub>`.
- [ ] Add `linkedin` to `ENABLED_PLATFORMS`.

**Plan for the expiry.** LinkedIn member tokens last about 60 days, and
programmatic refresh is itself a permissioned feature. Expect to re-issue this
token periodically; when LinkedIn starts failing and nothing else has changed,
that is why.

Company-page posting needs `urn:li:organization:<id>` and
`w_organization_social`, which only comes with Community Management API access.
Apply for that before planning around it.

### X

- [ ] In the developer portal, create a project and an app.
- [ ] Under the app's **User authentication settings**, set permissions to
      **Read and Write**.
- [ ] **Then** generate the Access Token and Secret. Tokens minted before you
      changed the permission stay read-only, and posting fails with a confusing
      403 — regenerate them after the change, not before.
- [ ] Set `X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, and
      `X_HANDLE` (used only to build the log's link).
- [ ] Add `x` to `ENABLED_PLATFORMS`.

On cost: the app keeps the post itself link-free and sends `linkUrl` as a reply,
since a post containing a link is billed far higher than one without. Set
`X_LINK_IN_REPLY=false` if you would rather pay to inline it. The app also
rejects anything over 280 characters before spending a call on it.

## 7. Point the daily task at the app

- [ ] Give your Claude scheduled task the production URL, the `INTAKE_TOKEN`,
      and [DRAFTS.md](DRAFTS.md) — that file is the format contract.
- [ ] Have it try `POST /api/drafts` first and fall back to committing a file
      into `drafts/` if the network blocks everything but GitHub.
- [ ] Tell it to name files uniquely, e.g. `2026-11-10-ai-agents.json`. A file's
      path is its identity: it imports exactly once, and editing it afterwards
      changes nothing.

## Rotating a secret later

Change it in Vercel, then **redeploy** — environment variables are read at
runtime by the functions, but a redeploy is the reliable way to be sure every
running instance sees the new value. Rotating `SESSION_SECRET` signs everyone
out of the dashboard, which is the point if you ever need it.

## When something fails

Start at `/api/health`: it tells you whether the database is reachable and which
credentials are present. Then the dashboard — every publish attempt is logged
under its draft with the platform's own error text, which is usually specific
enough to act on. A draft stuck in `publishing` means a run died mid-flight; use
**Back to queue** on it.
