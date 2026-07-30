---
name: setup
description: Set up or check the AI Project Manager link for this directory.
---

Setting up needs two things, **in this order**:

1. an **API token**, entered in the app's plugin settings — this starts the MCP
   server and authenticates everything below;
2. a **project**, which the user picks by name — no ID to copy.

**State 0 — no tools (check this first).** If `diagnostics` is not available to
you, the plugin's MCP server is not running. Do not try to work around it, and
do not go looking through the filesystem for its config. The cause is almost
always that no API token is configured yet. Tell the user, verbatim in
substance:

> The plugin's tools aren't loaded yet, which means no API token is configured.
> Open the web app → **Settings → MCP → Create Token**, then give it to the
> plugin one of these two ways — never by pasting it into this chat:
>
> - **In a terminal:** run `/plugin`, select **AI Project Manager**, paste it there.
> - **Anywhere else (including the desktop app):** write it to
>   `~/.ai-project-manager/token`:
>
>   ```
>   mkdir -p ~/.ai-project-manager
>   printf %s 'ppt_your_token_here' > ~/.ai-project-manager/token
>   chmod 600 ~/.ai-project-manager/token
>   ```
>
> Then restart the app and run `/thedevelofurr:setup` again.

Then **stop**. Recommend the token file whenever `/plugin` isn't available — it
needs an interactive terminal, which a desktop or SDK session doesn't have.

**Never ask the user to paste an API token into the conversation.** If one
appears anyway, tell them to revoke it (Settings → MCP) and issue a new one.

Otherwise run `current_project` and pick the matching case.

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
problem verbatim and give the `/plugin` or token-file instructions from State 0.
A project-scoped token still works but only reaches the one project it was
issued for; suggest replacing it with an account token.

**To move this directory to a different project:** `unlink_project`, then start
again from `list_projects`. `reset_connection` only reconnects the session — it
does not change the link.
