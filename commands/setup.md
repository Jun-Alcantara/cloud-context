---
name: setup
description: Set up or check the AI Project Manager link for this directory.
---

Setting up takes two things, **in this order**:

1. an **API token**, entered in Claude Code's plugin settings — this is what
   starts the MCP server and authenticates everything below;
2. a **project ID**, pasted into this conversation, which links this directory.

**State 0 — no tools (check this first).** If `diagnostics` is not available to
you, the plugin's MCP server is not running. Do not try to work around it, and
do not go looking through the filesystem for its config. The cause is almost
always that no API token is configured yet. Tell the user, verbatim in
substance:

> The plugin's tools aren't loaded yet, which means no API token is configured.
> Open the web app → your project → **Settings → MCP → Create Token**, then run
> `/plugin`, select **AI Project Manager**, and paste the token there. Restart
> Claude Code and run `/thedevelofurr:setup` again.
>
> Paste the token into the `/plugin` dialog only — not into this chat.

Then **stop**. `/plugin` needs an interactive terminal, so in a non-interactive
session (piped input, an SDK run, the desktop app without a TTY) setup cannot
be completed at all — say so plainly rather than leaving the user waiting.

If a token *is* configured and the tools are still missing, the server failed to
start: point the user at Claude Code's MCP logs (`claude --debug`, or the MCP
panel) and stop there.

Otherwise run `diagnostics` and pick the matching state below.

**Never ask the user to paste an API token into the conversation.** The project
ID is safe to paste; the token is a credential. If one appears in chat anyway,
tell them to revoke it (Project → Settings → MCP) and issue a new one.

---

**If the token is missing or rejected** (`token.present: false`, or
`token_owner.valid: false`):
- `token.reason` says which it is — never substituted, empty, or rejected by the
  backend. Relay that, then give the `/plugin` instructions from State 0.
- A `token_owner` mismatch is different: the token is valid but belongs to
  another project. `diagnostics` spells this out in `problem` — relay it and let
  the user choose between linking that project or minting a token for this one.

**If not linked** (token fine, no config file):
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

| Item                               | Status        |
| ---------------------------------- | ------------- |
| API (https://thedevelofurr.online) | ✅ Reachable  |
| API token                          | ✅ Valid      |
| Config file                        | ❌ Missing    |
| Project linked                     | ❌ Not linked |

**Pick a project:** https://thedevelofurr.online/connect

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
- Then update it in Claude Code plugin settings (`/plugin`) and restart.
