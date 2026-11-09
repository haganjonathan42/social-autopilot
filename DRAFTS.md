# Draft format

This is the contract between the daily Claude scheduled task and the app. One
JSON object is one day's post, already adapted per platform.

## The object

```json
{
  "topic": "Why small teams are shipping faster with AI agents",
  "facebook": "Full Facebook text. Line breaks are fine.\n\nEmoji are fine.",
  "instagram": "Caption text. Hashtags at the end.\n\n#AI #DataAnalytics",
  "linkedin": "Longer, more professional take. Paragraphs encouraged.",
  "x": "Short, punchy, under 280 characters. No link here.",
  "imageIdea": "A small team at a whiteboard with an AI assistant on screen",
  "imageUrl": "https://example.com/image.jpg",
  "linkUrl": "https://example.com/article",
  "scheduledFor": "2026-11-10T08:30:00Z"
}
```

### Fields

| Field | Required | Notes |
| --- | --- | --- |
| `topic` | yes | Short label used in the dashboard. Max 300 chars. |
| `facebook` | one of these four | Facebook Page post text. Max 6000 chars. |
| `instagram` | one of these four | Instagram caption. Max 6000 chars. Needs `imageUrl` to publish. |
| `linkedin` | one of these four | LinkedIn post text. Max 6000 chars. |
| `x` | one of these four | Post for X. Keep it under 280 characters and **link-free**. |
| `imageIdea` | no | Plain description of a suggested image. Not published; shown in the dashboard. |
| `imageUrl` | no | Public `https` URL of a real image. Required for Instagram; turns a Facebook post into a photo post. |
| `linkUrl` | no | The link for the post. On X it is posted as a reply, not in the post. |
| `scheduledFor` | no | ISO 8601 date-time, e.g. `2026-11-10T08:30:00Z`. Without it, the post goes out as soon as it is approved. |

At least one of `facebook`, `instagram`, `linkedin`, `x` must have text.
Anything else in the object is ignored.

### Writing for each platform

- **Facebook** — conversational, 1–3 short paragraphs. Links render a preview
  card, so `linkUrl` is cheap to use here.
- **Instagram** — caption first, hashtags in a block at the end. Links are not
  clickable in captions, so put the point in the text. Nothing publishes without
  an `imageUrl`.
- **LinkedIn** — lead with the insight, then the detail. A strong first line
  matters because the rest is collapsed behind "see more".
- **X** — hard 280-character limit, enforced by the app. Keep links out of the
  post itself: a post with a link costs roughly $0.20 against roughly $0.015
  without one, so the app posts `linkUrl` as a reply instead.

## Path A — POST to the API (preferred)

```bash
curl -X POST "https://<your-app>.vercel.app/api/drafts" \
  -H "Authorization: Bearer $INTAKE_TOKEN" \
  -H "Content-Type: application/json" \
  -d @draft.json
```

- Send one object, or an array of up to 20 objects.
- `201` — all stored. `207` — some stored, some rejected (the body lists which).
  `400` — nothing stored. `401` — wrong or missing token.
- Response body: `{ "ok": true, "created": [12], "rejected": [] }`

## Path B — commit a file into `/drafts` (backup)

Use this when the network can only reach GitHub. Commit a `.json` file into the
`drafts/` folder of `haganjonathan42/social-autopilot`. A cron job imports new
files every 15 minutes.

- One file holds either a single draft object or an array of them.
- **Name files uniquely**, e.g. `2026-11-10-ai-agents.json`. The file path is the
  draft's identity, so a file is imported exactly once.
- Editing a file after it has been imported does **not** change the draft.
  Edit it in the dashboard, or commit a new file.
- Invalid files are reported in the dashboard and skipped; they do not block the
  rest of the import.

## What happens next

Every draft arrives as `pending` and publishes nothing on its own. In the
dashboard you approve, edit or reject it, and optionally set a time. Approving
with no future time publishes immediately; approving with a future time hands it
to the scheduler.
