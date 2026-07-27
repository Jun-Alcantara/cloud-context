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

When you first enable the plugin, you'll be prompted for:
- **API URL** — The URL of your AI Project Manager backend (default: `http://localhost:3001`)
- **API Token** — Generate this in the web app: Project → Settings → MCP → Create Token

### Linking a directory to a project

If `.ai-project-manager.json` doesn't exist in the current directory:

1. Find the project ID in the web app — it's in the URL: `/projects/<PROJECT_ID>`
2. Run `setup_project` with that ID — the config file will be written automatically
3. All tools become available immediately

## Available tools

### diagnostics (always available)
Health report — checks backend connectivity, auth validity, and whether this directory is linked to a project. Use this first when something isn't working.

### setup_project (unconfigured directories)
Links this directory to a project in the web app. Requires the project UUID from the web app's URL.

### get_project_info (configured directories)
Returns the project's name, description, and kanban board count.

### kanban (configured directories)
Full kanban board management — boards, columns, tasks, and comments. Use the `kanban` skill for detailed workflow guidance.

## Troubleshooting

### "API token rejected" or "401 Unauthorized"
Your token may have expired or been revoked. Generate a new one in the web app and update it in Claude Code plugin settings.

### "Backend unreachable"
Make sure your AI Project Manager backend is running at the configured API URL. Check the URL in plugin settings.

### ".ai-project-manager.json not found"
This directory hasn't been linked to a project yet. Use the `setup_project` tool with your project's UUID from the web app.

### Tools not showing up
Run `diagnostics` to see the current state. If the config file exists but tools are missing, the project ID may be invalid.

## Config file format

```json
{
  "projectId": "00000000-0000-0000-0000-000000000000",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

This file lives at the root of your project directory (next to `.git`). You can commit it to share the project link with your team.
