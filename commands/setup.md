---
name: setup
description: Set up or check the AI Project Manager link for this directory.
---

When invoked, run `diagnostics` and present a clear summary to the user:

**If not linked:**
- Show a short status table (API reachable, config file, project linked).
- Give the user the connect link from `diagnostics` → `project.connect_url`.
  Present it as a clickable URL on its own line, and explain that it opens a page
  listing every project they own or belong to, each with a **Copy project ID**
  button. They must be signed in to the web app; if they aren't, the page sends
  them to login and back.
- If `connect_url` is null, fall back to explaining that the ID is the UUID in
  the web app URL (`/projects/<ID>`), and surface `connect_url_error`.
- Then ask them to paste the copied project ID here.
- When they paste it, run `setup_project` with that ID and confirm the result.
  If it fails, show the returned error and hint rather than guessing.

Example of the "not linked" output:

```
## AI Project Manager — Not Linked

| Item                        | Status        |
| --------------------------- | ------------- |
| API (https://thedevelofurr.online) | ✅ Reachable |
| Config file                 | ❌ Missing    |
| Project linked              | ❌ Not linked |

**Pick a project:** http://localhost:3000/connect

That page lists your projects with a **Copy project ID** button next to each one.
Copy the ID of the project you want to link, then paste it here and I'll finish
the setup.
```

**If already linked (configured + auth valid):**
- Show: project name, description, number of kanban boards, API URL, and config
  file path. Get the name and description from `get_project_info` and the board
  count from `kanban_manage` with `action: "list_boards"` — `diagnostics` alone
  only reports the project ID.
- Confirm everything is working.

**If linked but auth invalid:**
- Tell the user their API token has expired or is invalid.
- Direct them to the web app (Project → Settings → MCP) to create a new token.
- Then update it in Claude Code plugin settings (`/plugin`).
