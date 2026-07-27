---
name: setup
description: Set up or check the AI Project Manager link for this directory.
---

When invoked, run `diagnostics` and present a clear summary to the user:

**If not linked:**
- Explain that this directory needs a project ID to connect to AI Project Manager.
- Tell the user to find their project ID in the web app (it's in the URL: `/projects/<ID>`).
- Ask for the project ID, then run `setup_project` with it.

**If already linked (configured + auth valid):**
- Show: project name, description, number of kanban boards, API URL, and config file path.
- Confirm everything is working.

**If linked but auth invalid:**
- Tell the user their API token has expired or is invalid.
- Direct them to the web app (Project → Settings → MCP) to create a new token.
- Then update it in Claude Code plugin settings (`/plugin`).
