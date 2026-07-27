---
name: kanban
description: Guide for using the kanban board in AI Project Manager. Use when the user asks to view, manage, or organize kanban boards, columns, or tasks.
disable-model-invocation: false
---

# Kanban Board Management

Use the `kanban` MCP tool to manage kanban boards for the linked project in AI Project Manager.

## Available actions

### Boards

| Action          | Requires                 | Description                              |
| --------------- | ------------------------ | ---------------------------------------- |
| `list_boards`     | —                        | Get all boards (id, name, description)   |
| `get_board`       | `boardId`                  | Get board with all columns and tasks     |
| `create_board`    | `name`, optional `description` | Create a new board with 3 default columns |
| `update_board`    | `boardId`                  | Rename board or update description       |
| `delete_board`    | `boardId`                  | Delete board and all contents            |

### Columns

| Action          | Requires                        | Description                 |
| --------------- | ------------------------------- | --------------------------- |
| `create_column`   | `boardId`, `name`                   | Add a new column            |
| `update_column`   | `boardId`, `columnId`, `name`         | Rename a column             |
| `delete_column`   | `boardId`, `columnId`                 | Delete column and its tasks |

### Tasks

| Action        | Requires                                        | Description                         |
| ------------- | ----------------------------------------------- | ----------------------------------- |
| `create_task`   | `boardId`, `columnId`, `title`, optional `description` | Create task in a column           |
| `update_task`   | `boardId`, `taskId`                                 | Update task title or description  |
| `move_task`     | `boardId`, `taskId`, `columnId`, `position`           | Move task to different column     |
| `delete_task`   | `boardId`, `taskId`                                 | Delete a task                     |
| `get_task`      | `boardId`, `taskId`                                 | Get task with its comments        |

### Comments

| Action           | Requires                                | Description          |
| ---------------- | --------------------------------------- | -------------------- |
| `create_comment`   | `boardId`, `taskId`, `content`              | Add comment to task  |
| `list_comments`    | `boardId`, `taskId`                        | List task comments   |
| `delete_comment`   | `boardId`, `taskId`, `commentId`            | Delete a comment     |

## Workflows

### Viewing all boards

Call `kanban` with `action: "list_boards"`. Example response:
```json
{
  "boards": [
    { "id": "uuid-1", "name": "Sprint 1", "description": "Current sprint" },
    { "id": "uuid-2", "name": "Backlog", "description": null }
  ]
}
```

### Viewing a board

Call `kanban` with `action: "get_board"` and the `boardId`. Returns the board with all columns and tasks.

### Creating a board

Call `kanban` with `action: "create_board"`, `name`, and optional `description`. Three default columns (To Do, In Progress, Done) are created automatically.

### Creating a task

Call `kanban` with `action: "create_task"`, `boardId`, `columnId`, and `title`. The `description` is optional and supports GitHub-Flavored Markdown.

### Moving a task

Call `kanban` with `action: "move_task"`, `boardId`, `taskId`, `columnId`, and `position`. Use 0 for top position, or get the current board to find the next position.

### Presenting kanban to the user

When showing a board, format it as a structured table:

```
# Board: Sprint 1

## To Do
- [ ] Task title 1
- [ ] Task title 2

## In Progress
- [ ] Task title 3

## Done
- [x] Task title 4
```

Include task IDs when referencing specific tasks for future operations.

## Tips

- Always run `diagnostics` first if the project link might not be set up
- Board and column names are user-defined, don't assume naming conventions
- Task descriptions and comments use GitHub-flavored Markdown
- When creating a task at a specific position, examine the current board first to pick the right index
- Deleting a board deletes all columns and tasks — warn the user before deleting
