---
name: task
description: Create, update, or move a kanban task.
---

When invoked, do the following:

1. Run `diagnostics` to confirm the project is linked.
2. Run `kanban_manage` with `action: "list_boards"` to get available boards.
3. Ask the user which board the task belongs to.
4. Run `kanban_manage` with `action: "get_board"` for the chosen board to show columns and existing tasks.
5. Ask what they want to do: create a new task, move an existing task, update a task, or add a comment.
6. Based on their choice:
   - **Create**: ask for column, title, and optional description, then run `kanban_manage` with `action: "create_task"`.
   - **Move**: ask which task (by title or reference), target column, and position, then run `kanban_manage` with `action: "move_task"`.
   - **Update**: ask which task, then what to change (title, description, technical notes, or branch), then run `kanban_manage` with `action: "update_task"`.
   - **Comment**: ask which task and the comment text, then run `kanban_manage` with `action: "create_comment"`.

Always use the exact IDs returned by the API. Do not guess or fabricate IDs.

Every task carries a `reference` — `APRAS-001`, built from the project's
initials and a running number. Show it when you list tasks, and pass it as
`reference` instead of `taskId` when the user names a task that way; it
resolves across every board, so no `boardId` is needed alongside it.

Descriptions and comments render in a BlockNote rich-text editor, so write them
as GitHub-Flavored Markdown: `##` sections, `- [ ]` checklists for acceptance
criteria, tables for structured data, fenced code blocks with a language tag,
and a blank line between blocks. Raw HTML and other unsupported syntax is
flattened to plain text. The `kanban` skill has the full reference; a trivial
task needs nothing more than a sentence or two.

A task also has a second body, `technicalNotes` — the implementer-facing half,
shown as its own tab on the card. Files, existing pieces, constraints go there
rather than in the description, and every path in it is relative to the project
root, never absolute.
