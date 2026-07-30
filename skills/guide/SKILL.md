---
name: guide
description: Manage tasks and context in AI Project Manager. Use when the user asks about project tasks, kanban boards, or project management.
disable-model-invocation: false
---

# AI Project Manager Plugin

This plugin connects Claude Code to the **AI Project Manager** web app, enabling you to manage projects, kanban boards, and tasks without leaving Claude Code.

## How it works

1. **Install** — The plugin prompts for your API URL and token (one-time setup, stored securely).
2. **Link a directory** — Each repository needs a `.ai-project-manager.json` file linking it to a project in the web app.
3. **Use tools** — Once linked, Claude has access to kanban boards and project info.

## Setup

### First-time install

When you first enable the plugin, the only thing you're asked for is:
- **API Token** — Generate this in the web app: Project → Settings → MCP → Create Token

Give it to the plugin one of three ways — never by pasting it into a
conversation, since it's a credential. A token that ends up in chat should be
revoked in the web app and replaced. Only the *project ID* is safe to paste.

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

If `.ai-project-manager.json` doesn't exist in the current directory:

1. Run `diagnostics` and give the user the `connect_url` it reports (the web app's
   `/connect` page). It lists every project they own or belong to, each with a
   **Copy project ID** button.
2. Ask the user to paste the copied ID back
3. Run `setup_project` with that ID — the config file will be written automatically
4. All tools become available immediately

The project ID is also visible in the web app URL (`/projects/<PROJECT_ID>`) if the
connect page isn't reachable.

## Available tools

### diagnostics (always available)
Health report — checks backend connectivity, auth validity, and whether this directory is linked to a project. Use this first when something isn't working.

### reset_connection (always available)
Drops the current backend session and reconnects — the fix for session/connection
errors. With `unlink: true` it also deletes `.ai-project-manager.json`, so the
directory can be linked to a different project. It never touches the API token or
any server-side data.

### setup_project (unconfigured directories)
Links this directory to a project in the web app. Requires the project UUID from the web app's URL.

### get_project_info (configured directories)
Returns the project's name, description, and kanban board count.

### kanban (configured directories)
Full kanban board management — boards, columns, tasks, and comments. Use the `kanban` skill for detailed workflow guidance.

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

- `token.present: false` → the plugin's user config has no token. Run `/plugin`, set it, restart.
- `token_owner.valid: false` → the backend doesn't recognise it. It was revoked, or only partly
  pasted (check `token.looks_truncated`). Create a new one under Project → Settings → MCP.
- `token_owner.projectId` different from the linked project → the token is for another project.
  Either link that project, or create a token for this one. `diagnostics` states this in `problem`.

**A changed token only takes effect after Claude Code restarts** — the token is passed to the MCP
server as an environment variable at launch. If a fresh token still fails, check whether the server
is even sending the new one: `read_log` shows the prefix of the token used on each connect attempt.

### Tracing a failure
`read_log` returns the plugin's log tail (path is in `diagnostics.log_file`) — every request,
connect attempt, HTTP status and error body, with tokens redacted to their prefix.

### "Backend unreachable"
Make sure your AI Project Manager backend is running at the configured API URL. Check the URL in plugin settings.

### ".ai-project-manager.json not found"
This directory hasn't been linked to a project yet. Use the `setup_project` tool with your project's UUID from the web app.

### Tools not showing up
Run `diagnostics` to see the current state. If the config file exists but tools are missing, the project ID may be invalid.

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
