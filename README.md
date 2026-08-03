# AI Project Manager — Claude Code plugin

Connect Claude Code to [AI Project Manager](https://thedevelofurr.online) so
Claude can read and manage your kanban boards, tasks, and project context
directly from the terminal.

## Install

```
/plugin marketplace add Jun-Alcantara/cloud-context
/plugin install thedevelofurr@junalcantara
```

Then restart Claude Code and run:

```
/thedevelofurr:setup
```

It gives you a link, you click **Approve** in the browser (you're already signed
in), and it picks up from there. **No token to copy, no project ID to paste.**

```
Approve this machine to connect:
  https://thedevelofurr.online/connect/cli?code=6B7C-3RHZ
> approved
Connected as you@example.com. This directory is ~/parlon/api.
Link it to Parlon API (3 boards)?
> yes
Linked. Boards: Backlog, In Progress, Shipped.
```

The credential is written to `~/.ai-project-manager/token` (mode 600) by the
plugin itself — it is never shown to you, so it can't end up in a chat or a
screenshot. Revoke it any time under **Settings → MCP → Account tokens**.

The project link is stored on the server against this directory's path, so it
survives restarts, reinstalls, and new machines. Moving or renaming the
directory breaks it — run setup again.

### Headless machines

No browser to approve in (CI, a container)? Create a token in the web app and
pass it as `AIPM_API_TOKEN`.

### Pointing at a different backend

The plugin talks to `https://thedevelofurr.online`. If you self-host, or you're
developing against a local backend, launch Claude Code with:

```
AIPM_API_URL=http://localhost:3001 claude
```

Ask Claude to run `diagnostics` to confirm which URL is in effect — it reports
`api_url` alongside `api_url_source`.

Finally, link the current directory to a project:

```
/thedevelofurr:setup
```

## What you get

**Commands**

| Command | Purpose |
|---|---|
| `/thedevelofurr:setup` | Link this directory to a project, picked by name |
| `/thedevelofurr:board` | View or manage kanban boards |
| `/thedevelofurr:task` | Create, update, or move a task |
| `/thedevelofurr:specify` | Turn a feature request into a researched spec ticket |
| `/thedevelofurr:implement` | Pick up a ticket by reference, branch, build, push, report back |
| `/thedevelofurr:ship` | Both of the above in one run — spec it, settle the questions, build it |
| `/thedevelofurr:document` | The reverse — write changes you already made up onto the board |
| `/thedevelofurr:update` | Update the plugin to the latest version |
| `/thedevelofurr:reset` | Reset the connection, or unlink the directory |

`specify` and `implement` are two ends of the same run: `/thedevelofurr:specify`
files a ticket with an id like `APRAS-004`, and `/thedevelofurr:implement
APRAS-004` cuts a branch for it, builds it, pushes it, and comments on the card.

`/thedevelofurr:ship` runs both without stopping in between. It still files the
ticket first, so the work is recorded before any code exists; if the spec turns
up open questions it asks them in the chat, writes the answers back to the card,
and then builds. It composes the other two commands rather than copying them, so
changes to `specify` or `implement` apply to it automatically.

`/thedevelofurr:document` runs the same pipeline backwards, for the times you
didn't start at the board: you fixed something, cut a branch, maybe pushed it,
and no ticket exists. It reads the branch, asks what the change was *for* —
the one thing the diff can't tell it — files the ticket straight into Done,
records the branch on the card, and closes it out with the same comment
`implement` writes. It refuses to run on a branch that's already merged.

**Skills** — `guide` (task and context management) and `kanban` (board usage)
load automatically when you ask Claude about project tasks or boards.

**MCP tools** — `list_projects`, `link_project`, `current_project` are always
available; `unlink_project`, `get_project_info`, and `kanban_manage` appear once
the directory is linked. [`mcp-server.js`](mcp-server.js) adds `diagnostics`,
`read_log`, and `reset_connection` locally — those keep working even when the
backend doesn't.

## Troubleshooting

Ask Claude to run `diagnostics` to check connectivity, or `reset_connection` to
recover from a stale session. `read_log` surfaces the MCP server's own log.

## Requirements

- Claude Code
- Node.js (the MCP server uses only Node core modules — no `npm install`)
- An AI Project Manager account and a reachable backend

## Updating

See [DEPLOYMENT.md](DEPLOYMENT.md).
