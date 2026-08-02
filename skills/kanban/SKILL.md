---
name: kanban
description: Guide for using the kanban board in AI Project Manager. Use when the user asks to view, manage, or organize kanban boards, columns, or tasks.
disable-model-invocation: false
---

# Kanban Board Management

Use the `kanban_manage` MCP tool to manage kanban boards for the linked project in AI Project Manager.

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
| `create_task`   | `boardId`, `columnId`, `title`, optional `description`, `technicalNotes`, `position`, `parentTaskId` | Create task in a column — pass `parentTaskId` to nest it as a subtask |
| `update_task`   | `boardId`, `taskId`                                 | Update task title, description, or technical notes |
| `move_task`     | `boardId`, `taskId`, `columnId`, `position`           | Move task to different column     |
| `delete_task`   | `boardId`, `taskId`                                 | Delete a task                     |
| `get_task`      | `boardId`, `taskId`                                 | Get task with its comments        |

### Comments

| Action           | Requires                                | Description          |
| ---------------- | --------------------------------------- | -------------------- |
| `create_comment`   | `boardId`, `taskId`, `content`              | Add comment to task  |

There is no separate action for reading or deleting comments — use `get_task`,
which returns the task with all of its comments.

## The two halves of a task

A task carries two separate bodies, shown as tabs on its card:

| Field            | Written for                     | Contains                                                          |
| ---------------- | ------------------------------- | ----------------------------------------------------------------- |
| `description`    | whoever decides it gets built   | What must be true and why. No code, no class or table names, no framework vocabulary, no file paths. |
| `technicalNotes` | whoever builds it               | The files and modules involved, what already exists to reuse, constraints and gotchas. |

Every path in `technicalNotes` is **relative to the project root** —
`src/kanban/kanban.service.ts`, never `/home/someone/projects/…`. Whoever reads
the ticket has the repo checked out somewhere else, and an absolute path leaks
one machine's layout. The same goes for localhost URLs and personal directory
names.

## Writing descriptions and comments

Task bodies and comments are displayed in a **BlockNote** rich-text
editor. Send them as GitHub-Flavored Markdown — BlockNote parses that markdown
into blocks, so anything outside the supported syntax (raw HTML, footnotes,
nested tables, LaTeX) is dropped or flattened into plain text.

| Element      | Write it as                                        |
| ------------ | -------------------------------------------------- |
| Headings     | `# H1` … `###### H6` — prefer `##`/`###` in a body  |
| Emphasis     | `**bold**`, `_italic_`, `~~strike~~`, `` `code` ``  |
| Code block   | Fenced, with a language tag: ` ```typescript `      |
| Bullet list  | `- item`                                            |
| Numbered     | `1. item`                                           |
| Checklist    | `- [ ] todo` / `- [x] done`                         |
| Table        | `\| Col A \| Col B \|` with a `\|---\|---\|` separator |
| Blockquote   | `> quoted text`                                     |
| Link / image | `[label](url)` / `![alt](url)`                      |
| Divider      | `---`                                               |

Guidelines:

- Give every non-trivial task a structured description: a short overview
  paragraph, then `##` sections such as Overview, Acceptance Criteria, Notes.
- Use checklists for acceptance criteria and action items — they stay checkable
  in the editor.
- Use tables for structured data (endpoints, config values, options) and fenced
  code blocks with a language for snippets, commands, and terminal output.
- Leave a blank line between blocks; the parser needs it to close a list or
  paragraph.
- For a short or trivial task a couple of plain sentences is fine — don't
  over-format.

## Workflows

### Viewing all boards

Call `kanban_manage` with `action: "list_boards"`. Example response:
```json
{
  "boards": [
    { "id": "uuid-1", "name": "Sprint 1", "description": "Current sprint" },
    { "id": "uuid-2", "name": "Backlog", "description": null }
  ]
}
```

### Viewing a board

Call `kanban_manage` with `action: "get_board"` and the `boardId`. Returns the board with all columns and tasks.

### Creating a board

Call `kanban_manage` with `action: "create_board"`, `name`, and optional `description`. Three default columns (To Do, In Progress, Done) are created automatically.

### Creating a task

Call `kanban_manage` with `action: "create_task"`, `boardId`, `columnId`, and `title`. The `description` and `technicalNotes` are optional — see [The two halves of a task](#the-two-halves-of-a-task) for which goes where, and [Writing descriptions and comments](#writing-descriptions-and-comments) for the format. Send both in the one call rather than patching notes on afterwards.

### Moving a task

Call `kanban_manage` with `action: "move_task"`, `boardId`, `taskId`, `columnId`, and `position`. Use 0 for top position, or get the current board to find the next position.

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
- Task bodies and comments render in a BlockNote editor — write them as
  GitHub-Flavored Markdown, see [Writing descriptions and comments](#writing-descriptions-and-comments)
- Keep the technical detail out of `description` and in `technicalNotes`, with
  every path relative to the project root
- When creating a task at a specific position, examine the current board first to pick the right index
- Deleting a board deletes all columns and tasks — warn the user before deleting
