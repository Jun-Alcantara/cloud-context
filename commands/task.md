---
name: task
description: Create, update, or move a kanban task.
---

When invoked, do the following:

1. Run `diagnostics` to confirm the project is linked.
2. Run `kanban` with `action: "list_boards"` to get available boards.
3. Ask the user which board the task belongs to.
4. Run `kanban` with `action: "get_board"` for the chosen board to show columns and existing tasks.
5. Ask what they want to do: create a new task, move an existing task, update a task, or add a comment.
6. Based on their choice:
   - **Create**: ask for column, title, and optional description, then run `kanban` with `action: "create_task"`.
   - **Move**: ask which task (by title or id), target column, and position, then run `kanban` with `action: "move_task"`.
   - **Update**: ask which task, then what to change (title/description), then run `kanban` with `action: "update_task"`.
   - **Comment**: ask which task and the comment text, then run `kanban` with `action: "create_comment"`.

Always use the exact IDs returned by the API. Do not guess or fabricate IDs.
