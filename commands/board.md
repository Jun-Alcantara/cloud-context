---
name: board
description: View or manage kanban boards for the linked project.
---

When invoked, do the following in order:

1. Run `diagnostics` to confirm the project is linked.
2. If not linked, tell the user to run `/ai-pm:setup` first.
3. Run `kanban` with `action: "list_boards"` to get all boards.
4. Present the boards as a numbered list. Ask the user which board they want to view, or if they want to create a new one.
5. If they pick a board, run `kanban` with `action: "get_board"` and the chosen `boardId`. Present the board as a structured table with columns as headings and tasks listed under each.
6. If they want to create a board, ask for the name, then run `kanban` with `action: "create_board"`.

Always show the board ID alongside each board name so the user can reference it later.
