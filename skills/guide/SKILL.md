---
name: guide
description: Manage tasks and context in AI Project Manager. Use when the user asks about project tasks, kanban boards, or project management.
disable-model-invocation: false
---

# AI Project Manager Plugin

This plugin connects Claude Code to the **AI Project Manager** web app, enabling you to manage projects, kanban boards, and tasks without leaving Claude Code.

## How it works

1. **Install** — Provide an API token once. It identifies your *account*, so it
   reaches every project you belong to.
2. **Link a directory** — Pick a project by name; the link is stored server-side
   against this directory's path, not in a local file.
3. **Use tools** — The kanban tools appear the moment a link exists.

## Setup

### First-time install

When you first enable the plugin, the only thing you're asked for is:
- **API Token** — Generate this in the web app: **Settings → MCP → Create Token**

Give it to the plugin one of three ways — never by pasting it into a
conversation, since it's a credential. A token that ends up in chat should be
revoked in the web app and replaced.

| Route | Use when |
|---|---|
| `/plugin` → AI Project Manager | You're in a terminal (needs a TTY) |
| `~/.ai-project-manager/token` (chmod 600) | Desktop app, SDK, anywhere without `/plugin` |
| `AIPM_API_TOKEN` env var | CI, containers, or a per-shell token |

They're checked in that order. `diagnostics` reports which one supplied the
token as `token.source`, and never echoes the value itself.

The plugin talks to `https://thedevelofurr.online` out of the box. Developers
and self-hosters can point it elsewhere by launching Claude Code with
`AIPM_API_URL=http://localhost:3001 claude`; `diagnostics` reports the URL in
effect and its origin (`api_url` / `api_url_source`).

### Linking a directory to a project

No UUID is involved. Call `list_projects`, offer the `suggested` one as the
default if there is one, and call `link_project` with what the user picks. See
the `/thedevelofurr:setup` command for the exact wording.

The link is keyed on this directory's path and stored server-side, so it
survives restarts and reinstalls. Renaming or moving the directory breaks it —
`current_project` then reports `{linked: false}` and setup simply runs again.

## Available tools

### list_projects (always available)
Every project this account can reach, newest first, with board counts. At most
one is flagged `suggested` with a `suggestedReason` — `git-remote` (another
directory with the same remote is already linked to it), `directory-name`, or
`only-project`. Offer that one instead of asking the user to choose blind. An
empty list means the account has no projects yet — not a connection problem.

### link_project (always available)
Binds this directory to a project. Takes `project_id` from `list_projects`.
Relinking replaces the previous link, so correcting a wrong choice needs no
unlink first.

### current_project (always available)
What this directory resolves to. `{linked: false, hint}` is a normal answer —
unlinked, renamed, moved, or the project is gone. Re-run setup rather than
reporting a failure.

### unlink_project (linked directories)
Forgets the link. Touches nothing else — not the project, not its data.

### diagnostics (always available)
Health report — token source, connectivity, the workspace path and git remote
being reported, and what this directory is linked to. Use this first when
something isn't working.

### reset_connection (always available)
Drops the backend session and reconnects — the fix for session/connection
errors. It does **not** change the link; use `unlink_project` for that.

### get_project_info · kanban_manage (linked directories)
Project details and full kanban management — boards, columns, tasks, comments.
Use the `kanban` skill for workflow guidance.

## Troubleshooting

### None of the plugin's tools exist
If `diagnostics` itself is unavailable, the MCP server isn't running — usually
because no API token is configured, so there is nothing to diagnose *with*.
Don't go spelunking through `installed_plugins.json`, the plugin cache, or
`mcp-server.js` to reconstruct the state. Tell the user to create a token
(Project → Settings → MCP → Create Token), enter it via `/plugin`, and restart
Claude Code.

`/plugin` requires an interactive terminal. In a non-interactive session the
setup cannot be completed at all — say so instead of leaving the user waiting.

### "API token rejected" or "401 Unauthorized"
Run `diagnostics` and read the `token` and `token_owner` fields before advising anything:

- `token.present: false` → no token anywhere. Set one via `/plugin` or the token file, then restart.
- `token_owner.valid: false` → the backend doesn't recognise it. It was revoked, or only partly
  pasted (check `token.looks_truncated`). Create a new one under Settings → MCP.
- `token_owner.scope: "project"` → a legacy project-scoped token. It works, but only reaches the
  one project it was issued for. An account token reaches all of them.

**A changed token only takes effect after Claude Code restarts** — the token is passed to the MCP
server as an environment variable at launch. If a fresh token still fails, check whether the server
is even sending the new one: `read_log` shows the prefix of the token used on each connect attempt.

### Tracing a failure
`read_log` returns the plugin's log tail (path is in `diagnostics.log_file`) — every request,
connect attempt, HTTP status and error body, with tokens redacted to their prefix.

### "Backend unreachable"
Make sure your AI Project Manager backend is running at the configured API URL. Check the URL in plugin settings.

### This directory isn't linked
`current_project` returns `{linked: false}` when the directory was never linked,
or was renamed or moved since. Run `list_projects` and `link_project` again —
it's a two-step fix, not an error to report.

### A leftover .ai-project-manager.json
Versions before 0.9.0 stored the link in that file. It's now ignored;
`diagnostics` reports it as `stale_local_config` so the user can delete it.

### Tools not showing up
Run `diagnostics`. If `api_auth_valid` is false the token is the problem; if the
directory simply isn't linked, only the linking tools appear — that's expected,
and `link_project` makes the rest materialise.

### "SSE rpc failed: HTTP 404" / "Session not found"
The backend forgot the session — it keeps them in memory, so a backend restart or
a redeploy invalidates them. The plugin reconnects and retries once automatically;
if calls still fail, run `reset_connection`.

### Wrong project linked
Run `reset_connection` with `unlink: true`, then `setup_project` with the correct
project ID.

## Config file format

```json
{
  "projectId": "00000000-0000-0000-0000-000000000000",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

This file lives at the root of your project directory (next to `.git`). You can commit it to share the project link with your team.
