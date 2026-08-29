---
name: kanban
description: Guide for using the kanban board in AI Project Manager. Use when the user asks to view, manage, or organize kanban boards, columns, or tasks.
disable-model-invocation: false
---

# Kanban Board Management

Use the `kanban_manage` MCP tool to manage kanban boards for the linked project in AI Project Manager.

## Finding a task: search before you enumerate

When you need to *find* something rather than act on a task you already have,
reach for `search_tasks` first. `get_board` returns every task on a board in
full, so using it to hunt for a topic burns context on cards you will not read.

`search_tasks` matches on meaning, not keywords, and hands back the specific
passage that matched:

| Argument          | Default | Notes                                                        |
| ----------------- | ------- | ------------------------------------------------------------ |
| `query`           | —       | Required. Describe the concept in natural language.           |
| `limit`           | 8       | Max 25.                                                       |
| `boardId`         | —       | Omit to search every board in the project.                    |
| `includeComments` | true    | Set false to search only the ticket bodies.                   |
| `minScore`        | 0.3     | Raise if results are loose, lower if an expected match misses. |

Each result carries a `reference`, so the follow-up is `kanban_manage` with
`get_task` for the ones worth reading in full.

Two fields in the response change what you should say:

- **`indexedTaskCount: 0`** — the project has nothing indexed, which is *not*
  the same as "no such task". Indexing is manual: a person clicks **Embed** on
  a card in the web UI. Tell the user that rather than reporting the task
  missing.
- **`stale: true`** on a result — that ticket was edited after it was indexed,
  so the passage may be out of date. Pull the current version with `get_task`
  before relying on it.

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
| `create_task`   | `boardId`, `columnId`, `title`, optional `description`, `technicalNotes`, `branch`, `position`, `parentTaskId` | Create task in a column — pass `parentTaskId` to nest it as a subtask |
| `update_task`   | task identity                                     | Update task title, description, technical notes, or branch — for creating a body or replacing one on purpose. For any change to a body that already has content, use `patch_task_body` instead |
| `patch_task_body` | task identity, `field` (`description` or `technicalNotes`), `edits` | Edit part of a body in place instead of resending the whole field — an ordered list of `{find, replace}` pairs, each an exact string match applied in sequence. Every `find` must match exactly once: if one is missing or appears more than once, the whole call fails and nothing is written |
| `move_task`     | task identity, `columnId`, optional `position`      | Move task to different column — bottom of it if `position` is omitted |
| `delete_task`   | `boardId`, `taskId`                                 | Delete a task                     |
| `get_task`      | task identity                                     | Get task with its comments, subtasks (id, reference, and title only — call `get_task` with a subtask's `reference` for its own body), ancestor chain, and the board and columns it lives on |

### Comments

| Action           | Requires                                | Description          |
| ---------------- | --------------------------------------- | -------------------- |
| `create_comment`   | task identity, `content`                  | Add comment to task  |

There is no separate action for reading or deleting comments — use `get_task`,
which returns the task with all of its comments.

## Identifying a task

Where the table above says *task identity*, the task can be named either way:

| Pass                  | When                                                        |
| --------------------- | ----------------------------------------------------------- |
| `reference`           | The user quoted an id like `APRAS-001`. Resolved across every board in the project, so no `boardId` is needed. |
| `taskId` + `boardId`  | You are working from uuids returned by `get_board`.          |

Every task has a `reference`, assigned at creation from the project's initials
and a running number — "Academe Portal - RFID Attendance System" gives
`APRAS-001`, `APRAS-002`, and so on. It never changes and is never reused, so
it is safe to put in a branch name or a commit message. Show it whenever you
list tasks for a human; they cannot quote a uuid back at you.

## Patching a body in place

A body you did not just write belongs to whoever wrote it — patch it with
`patch_task_body`, don't overwrite it with `update_task`.

- **Copy `find` verbatim out of a fresh `get_task`** — don't retype it or reuse
  text from earlier in the conversation. A card someone opened in the browser
  round-trips through the editor's markdown serialiser, so its spacing, list
  markers, and escaping may no longer match what was originally sent.
- **Disambiguate bare bullets** — if a line could match in more than one place,
  include the heading above it, or the line after it, in `find`.
- **There is no insert-at-a-point mode.** To add a line, put the line before it
  in `find` and repeat that line plus the new one in `replace`.
- **Deleting a numbered item means renumbering the ones that follow**, in the
  same call.
- **If a `find` fails to match, re-read the body** — call `get_task` again and
  retry. Never fall back to `update_task`; that overwrites everything anyone
  else has changed since.

## Viewing an image in a body

A `description`, `technicalNotes`, or comment can contain an image as
`![alt](url)` or as an image block. `get_task` and `get_board` hand that url
back as plain text — a reference, not something you can look at. Call the
`get_task_image` tool (a separate top-level tool, not a `kanban_manage`
action) with that exact `url` to get the image itself back as visible
content.

Only jpeg, png, gif, and webp are viewable this way. Other attachment types —
pdf, video, audio, zip, or an image format outside that list — cannot be
viewed through this tool; there is currently no way to see or read those,
only to know from the url that they exist.

## Attaching an image to a body

To put a new image into a body — a screenshot, a diagram, a file from the
repo — call `attach_task_image`; it returns a `url`. Insert that url into the
body yourself as `![alt](url)`, the same as any other image, with
`update_task`, `patch_task_body`, or `create_comment`. `attach_task_image`
only stores the image — it does not touch any task itself.

**Always pass `filePath` (an absolute path) when the image already exists on
disk** — a Playwright screenshot, a file from the repo. The plugin reads and
base64-encodes it locally; nothing about the bytes passes through you. Only
fall back to `data` + `filename` (base64 you already have in hand) when there
is no file to point at. Reproducing a long base64 string yourself is exactly
the failure mode `filePath` exists to avoid — it is easy to silently drop or
alter a character over a few thousand characters, and nothing downstream
catches it; the upload just ends up corrupted with no error anywhere.

`filePath` only works inside the project directory or the OS temp directory
— that covers both real cases (a repo file, a fresh screenshot) while
refusing to read anything else on the machine, such as credentials.

Only jpeg, png, gif, and webp are accepted, matching what `get_task_image`
can read back, capped at 5MB — resize anything bigger first.

## The branch field

`branch` holds the git branch the work for a task lives on — a plain branch
name like `feature/apras-001-rfid-tap`, not a URL and not a remote. Set it when
the branch is cut, and pass an empty string to clear it. The
`/thedevelofurr:implement` command writes it automatically.

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
- [ ] APRAS-001  Task title 1
- [ ] APRAS-004  Task title 2

## In Progress
- [ ] APRAS-002  Task title 3

## Done
- [x] APRAS-003  Task title 4
```

Lead with the reference — it is the id a person can quote back at you, and the
one that ends up in branch names and commit messages.

## Tips

- Always run `diagnostics` first if the project link might not be set up
- Show the `reference` whenever you list tasks, and accept one wherever the user
  gives you one — `get_task`, `update_task`, `patch_task_body`, `move_task` and
  `create_comment` all take it in place of `taskId`
- Board and column names are user-defined, don't assume naming conventions
- Task bodies and comments render in a BlockNote editor — write them as
  GitHub-Flavored Markdown, see [Writing descriptions and comments](#writing-descriptions-and-comments)
- Keep the technical detail out of `description` and in `technicalNotes`, with
  every path relative to the project root
- When creating a task at a specific position, examine the current board first to pick the right index
- Deleting a board deletes all columns and tasks — warn the user before deleting
