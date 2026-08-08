---
name: board
description: View or manage kanban boards for the linked project.
---

When invoked, do the following in order:

1. Run `diagnostics` to confirm the project is linked.
2. If not linked, tell the user to run `/thedevelofurr:setup` first.
3. If the user asked about a topic rather than a board ("what do we have on
   caching?"), run `search_tasks` instead of walking the boards — it returns the
   matching passages directly. The steps below are for browsing.
4. Run `kanban_manage` with `action: "list_boards"` to get all boards.
5. Present the boards as a numbered list. Ask the user which board they want to view, or if they want to create a new one.
6. If they pick a board, run `kanban_manage` with `action: "get_board"` and the chosen `boardId`. Present the board as a structured table with columns as headings and tasks listed under each.
7. If they want to create a board, ask for the name, then run `kanban_manage` with `action: "create_board"`.

Always show the board ID alongside each board name so the user can reference it later.
