---
name: documents
description: Guide for reading and editing project documents in AI Project Manager. Use when the user asks to read, find something in, summarize, edit, update, or write a project document, doc, or page.
disable-model-invocation: false
---

# Project Documents

Documents are the project's Notion-like pages. Each one is stored as a list of
**blocks** — a paragraph, a heading, a list item, an image, a table — and every
block has a stable `id` and its own `version`. The tools below let you read and
change a document block by block instead of all at once.

## Finding a document

Call `list_documents` to get every document's id, title, folder, and access.
It matches by title only — there is no search across all documents' contents
yet. Once you have the `id`, everything else works on that one document.

## Reading: don't pull a long document whole

`get_document` returns the entire document as markdown. That is fine for a
short page, but on a long one it burns context on sections you will not read.
Work down from the smallest read that answers the question:

| You want to…                          | Call                    |
| ------------------------------------- | ----------------------- |
| Find where a word or phrase appears   | `search_document`       |
| See how the document is laid out      | `get_document_outline`  |
| Read one section, or specific blocks  | `get_document_blocks`   |
| Read or summarize the whole thing     | `get_document`          |
| Look at an image in the markdown      | `get_document_image`    |

A summary of the whole document is the one case where `get_document` is the
right call. For anything aimed at a part — "what does the pricing section say",
"fix the typo in the setup steps" — start with search or the outline.

### search_document

| Argument     | Default | Notes                                                        |
| ------------ | ------- | ------------------------------------------------------------ |
| `documentId` | —       | Required.                                                    |
| `query`      | —       | Required. Case-insensitive text match.                       |
| `limit`      | 20      | Max 50.                                                      |

This is a **text match, not semantic search**. Search for literal words or
phrases that would actually appear in the text — `pricing`, `per seat`,
`Stripe` — not a description of the idea. If nothing matches, try a shorter
word or a synonym before concluding it isn't there.

Each match carries the block's `id`, `type`, `version` and `markdown`, the
nearest `heading` above it (`{ id, text }`, or `null` before the first heading),
and short `before` / `after` text from the neighbouring blocks. `truncated:
true` means there were more matches than `limit`.

### get_document_outline

| Argument     | Default | Notes      |
| ------------ | ------- | ---------- |
| `documentId` | —       | Required.  |

Returns `title`, `totalBlocks`, `leadingBlocks` (blocks before the first
heading) and `headings: [{ id, level, text, blockCount }]`. `blockCount` is how
many blocks sit under that heading until the next heading of the same or
higher level — use it to judge whether a section is small enough to read in
one go.

### get_document_blocks

| Argument          | Default | Notes                                                        |
| ----------------- | ------- | ------------------------------------------------------------ |
| `documentId`      | —       | Required.                                                    |
| `ids`             | —       | Block ids to read. Pass this **or** `underHeading`, not both. |
| `underHeading`    | —       | A heading block's id — returns the heading and its whole section. |
| `includeChildren` | true    | Also return blocks nested under the requested ids.           |

Returns `blocks: [{ id, parentId, depth, type, version, markdown }]`, at most
200. Each block's `markdown` is **its own content only** — a list item's nested
items come back as separate entries, linked by `parentId`. `truncated: true`
means the section was bigger than 200 blocks; read it in smaller pieces by
`ids`.

## Editing: change blocks by id

`edit_document_blocks` takes a list of edits, applied in order. Max 50 per call,
and the call is all-or-nothing — if one edit fails, none are written.

| Argument     | Default | Notes                                   |
| ------------ | ------- | --------------------------------------- |
| `documentId` | —       | Required.                               |
| `edits`      | —       | Required. Up to 50, applied in order.   |

| `op`      | Requires                                | What it does                                                   |
| --------- | --------------------------------------- | -------------------------------------------------------------- |
| `replace` | `id`, `expectedVersion`, `markdown`     | Replaces the block's own content; blocks nested under it are kept. If `markdown` holds several blocks, the first replaces this one and the rest are inserted right after it. |
| `insert`  | `markdown`, optional `afterId` or `position` (`start` / `end`) | Adds new blocks right after `afterId` (as its siblings), or at the start or end of the document. Default is the end. |
| `delete`  | `id`, `expectedVersion`                 | Removes the block **and everything nested under it**.          |

Returns `version`, `changed: [{ id, version, markdown }]` and `deleted: [ids]`.

### expectedVersion and conflicts

`expectedVersion` is the block's `version` as you last read it, from
`get_document_blocks` or `search_document`. It is how the tool knows you are
editing the text you actually saw.

If someone changed that block since — usually the user, typing in the browser
at the same time — the whole call is refused with `conflicts: [{ id, reason }]`.
Then:

1. Re-read those blocks with `get_document_blocks`.
2. Re-apply your change to the **fresh** content — keep what they wrote.
3. Retry with the new versions.

Never retry by just bumping `expectedVersion` to the new number. That writes
your old text over whatever they just changed.

### Keep edits small

- **Replace the block that needs to change, not the section around it.** If
  one sentence in a paragraph is wrong, replace that paragraph — don't delete
  and re-insert the whole section. Untouched blocks keep their ids, their
  history, and anything the user is editing at that moment.
- **Copy the current `markdown` from a fresh read** and change only what you
  mean to change. Don't retype a block from memory.
- **Mind `delete` on a parent** — a list item with nested items takes them all
  with it. Read with `includeChildren` first if you are unsure what is under it.
- **To add something in the middle, `insert` with `afterId`** set to the block
  it should follow.

### Tell the user what changed

Every `edit_document_blocks` call becomes its own entry in the document's
version history, separate from the user's own edits. After editing, say in a
line or two what you changed, and that they can review or undo it from the
**History** button on the document.

## Creating a document

`create_document` makes a new page:

| Argument   | Default | Notes                                   |
| ---------- | ------- | --------------------------------------- |
| `title`    | —       | Required.                               |
| `markdown` | —       | Optional. The whole body in one go.     |
| `folderId` | —       | Optional. Omit to create it at the top level. |

Returns `id`, `title`, `version` and `_link` — give the user the link. Send the
full body in `markdown` rather than creating an empty page and inserting into it
afterwards.

## Writing markdown

Markdown in and out is GitHub-flavoured, parsed into BlockNote blocks — the same
rules as task bodies (see the `kanban` skill's *Writing descriptions and
comments*). Headings, lists, checklists, tables, code blocks, quotes, links and
dividers all work; raw HTML, footnotes and LaTeX do not. Leave a blank line
between blocks. Images appear as `![alt](url)`; call `get_document_image` with
that url to actually see one.

## Worked example: "update the pricing section"

1. `list_documents` → find "Product Spec", id `doc-1`.
2. `get_document_outline { documentId: "doc-1" }` → a heading
   `{ id: "h-7", level: 2, text: "Pricing", blockCount: 6 }`.
3. `get_document_blocks { documentId: "doc-1", underHeading: "h-7" }` → the
   heading plus six blocks, including
   `{ id: "b-9", version: 3, markdown: "Pro plan: $12 per seat per month." }`.
4. Change only that block, and add a note after it:

   ```json
   {
     "documentId": "doc-1",
     "edits": [
       { "op": "replace", "id": "b-9", "expectedVersion": 3,
         "markdown": "Pro plan: $15 per seat per month." },
       { "op": "insert", "afterId": "b-9",
         "markdown": "Existing customers keep $12 until their next renewal." }
     ]
   }
   ```

5. If it comes back with `conflicts: [{ id: "b-9", … }]`, re-read `b-9`, apply
   the price change to its new text, and send again with its new version.
6. Tell the user: "Changed the Pro price to $15 and added a line about
   existing customers under Pricing — it's in the document's History if you
   want to undo it."

If the user had said "the part about per-seat pricing" with no section name,
step 2 would be `search_document { documentId: "doc-1", query: "per seat" }`
instead, and the match already carries the `id` and `version` you need.

## Tips

- Search or outline first; `get_document` only when you truly need all of it
- `search_document` matches literal text — search for words that would be in
  the document, not for the idea
- Always pass the `expectedVersion` from your latest read, and on a conflict
  re-read and re-apply — never just bump the number
- Prefer one small `replace` over rewriting a section
- After editing, tell the user what changed and point them to **History**
