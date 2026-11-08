# /drafts

Backup intake folder. Commit a `.json` file here and the cron job at
`/api/cron/import-drafts` imports it into the database within 15 minutes.

The format is in [../DRAFTS.md](../DRAFTS.md).

Rules worth repeating:

- Give every file a unique name, e.g. `2026-11-10-ai-agents.json`. The file path
  is the draft's identity, so each file is imported exactly once.
- Editing a file after import does nothing. Edit the draft in the dashboard.
- `example.json` in this folder is a template. It is skipped by the importer
  because its name starts with `example`.
