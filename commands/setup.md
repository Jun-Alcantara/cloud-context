---
name: setup
description: Set up or check the AI Project Manager link for this directory.
---

Setup is two clicks and one word. Nothing is copied or pasted:

1. **Connect the account** — the user approves this machine in their browser.
2. **Pick a project** — offered by name, usually just confirmed.

**Never ask the user for an API token.** Not in the chat, not from a settings
page. `connect_account` obtains one and stores it itself. A token that appears
in a conversation must be revoked (Settings → MCP) and replaced.

Start by calling `current_project`, then match a case below.

---

**If no tools exist at all.** `diagnostics` unavailable means the MCP server
isn't running — the plugin isn't installed or enabled. Say that and stop; don't
go looking through the filesystem for its config.

**If `diagnostics` reports no token** (`token.present: false`), or any call
fails with 401:

1. Call `connect_account`.
2. It returns an `approval_url` and a `code`. Give the user the URL **as a
   clickable link on its own line** and tell them to click **Approve** on that
   page. Mention the code so they can confirm the page matches.
3. Call `connect_account` again — it resumes the same request. Repeat while it
   returns `waiting_for_approval`; the request is good for ten minutes.
4. When it returns `connected: true`, carry straight on to picking a project.
   Don't announce the token; there's nothing for the user to do with it.

Example of step 2:

```
Approve this machine to connect:

**https://thedevelofurr.online/connect/cli?code=6B7C-3RHZ**

You're already signed in, so it's one click. Tell me when you've approved it
(code 6B7C-3RHZ).
```

If `connect_account` fails outright — the backend is unreachable, or approval
was denied — say so and offer the fallback: create a token in the web app
(Settings → MCP) and set it via `/plugin` in a terminal, or write it to
`~/.ai-project-manager/token`. That's the escape hatch, not the default.

---

**If it's already linked** (`{linked: true}`):
- Confirm the project by name, and show its boards using `kanban_manage` with
  `action: "list_boards"`.
- Nothing else is needed — don't re-link.

**If it's not linked** (`{linked: false}`):
1. Call `list_projects`.
2. If one is flagged `suggested`, **offer it as the default** and say why —
   `git-remote` means another directory with the same remote is already linked
   to it, `directory-name` means the folder matches the project's name,
   `only-project` means it's the only one. Ask for a yes, not a choice:

   ```
   Connected as jun@example.com. This directory is ~/parlon/api.
   Link it to **Parlon API** (3 boards)? Or pick another:
     2. Parlon Web    — 2 boards
     3. Cloud Context — 1 board
   ```

3. If nothing is suggested, list the projects with their board counts and ask
   which one.
4. Call `link_project` with the chosen `project_id`. The kanban tools appear as
   soon as it succeeds.
5. Confirm with the project's name and its boards — never with a UUID.

**If the account has no projects** (`list_projects` returns an empty list):
that's not an error. Tell the user to create one in the web app, give them the
link from `diagnostics` → `project.web_app`, and stop.

**If the token is rejected** (`diagnostics` → `problem` says so): relay the
problem verbatim, then call `connect_account` to get a fresh one — a revoked or
mistyped token is fixed by reconnecting, not by asking the user for a new value.
A project-scoped token still works but reaches only the project it was issued
for; `connect_account` replaces it with an account token.

**To move this directory to a different project:** `unlink_project`, then start
again from `list_projects`. `reset_connection` only reconnects the session — it
does not change the link.
