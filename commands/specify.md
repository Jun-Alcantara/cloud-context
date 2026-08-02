---
name: specify
description: Turn a feature request into a researched spec ticket on the kanban board.
argument-hint: [what you want to build, in plain words]
---

The user wants a feature. Turn their sentence into a **spec ticket** on the
kanban board — grounded in this codebase, not in generic advice.

Feature request: **$ARGUMENTS**

If that is empty, ask what they want to build and stop until they answer.

The job is three steps, in order: **research → draft → file**. Do not skip the
research; a spec that could have been written without opening the repo is a
failed spec.

## A ticket has two halves

The kanban card carries two separate documents, shown as tabs. Write both, and
keep them apart:

- **Description** — the requirements. Written for the person who decides
  *whether* this gets built. This is the document the rest of this file is
  about, and its rules are strict.
- **Technical Notes** — what you found in the repo, written for whoever builds
  it. The one place specifics belong. See **The technical notes** below.

They are separate fields on the task, not two sections of one body. Nothing
technical leaks upward into the description; nothing requirement-shaped gets
restated downward in the notes.

## The one hard rule: specify only — no plan, no code

This is the **first** of three separate stages: **specify → plan → implement**.
This command owns the first one and stops there. It produces a requirements
document: *what* is being built and *why*, plus the research that grounds it.
**How** is the planning stage's job, and writing it is the implementation
stage's. Collapsing them defeats the point of having them.

For the whole run you are **read-only on the repo**. Do not create, edit, or
delete a single file. Do not run migrations, generators, installs, formatters,
or tests. Do not start a branch, a commit, or a PR. The only thing this command
writes anywhere is the kanban ticket.

Both halves of the ticket stay clear of code. **There is no code in the ticket
at all**: no function bodies, no queries, no migrations, no diffs, not even a
one-line signature. Naming a file the notes point at is grounding; pasting what
is inside it is not.

Finish by handing over the ticket. **Do not offer to plan or start building,
and do not begin either if the user seems eager.** The next stage is a
separate, explicit request. If they want it, they'll ask.

## Who reads the description: stakeholders, not developers

Write for the person who decides *whether* this gets built — a founder, a
client, a product owner, a school administrator. Assume they have never opened
the codebase and do not read code. If a sentence would make them stop and ask
"what does that mean?", it has failed, no matter how precise it is.

**Never put these in the description:**

- Code of any kind — snippets, fenced blocks, function bodies, queries, diffs.
- Class, method, or constant names: `RfidController::tap()`, `Role::SUPER_ADMIN`,
  `SchoolSetting`.
- Table and column names: `users.school_id`, `rfid_logs`, `schools.is_active`.
- Query or ORM fragments: `->first()`, `whereUid(...)`, `SELECT`.
- Framework vocabulary: controller, middleware, migration, endpoint, route,
  model, index, foreign key, nullable, JSON response.
- File paths of any kind. They have a field of their own now.

**Translate instead.** The research is what makes the requirement *correct*; the
wording is what makes it *readable*. Say the same fact in the language of the
business:

| Instead of | Write |
|---|---|
| `Role::SUPER_ADMIN` can edit it | Only a Super Admin can change this |
| `users.school_id` stays unchanged | The person stays enrolled at their own campus |
| `rfid_logs.school_id` = tapping school | The visit is recorded at the campus where it happened |
| `users.uid` is indexed, not unique | The same card number can already exist at two campuses |
| `RfidController::tap()` rejects the card | A visitor's card is refused at the door |
| Add a `school_branches` pivot table | Campuses can be linked together as one institution |

A latent bug found during research is still worth raising — describe its
**consequence**, not its mechanism. "Two people at different campuses who happen
to share a card number can already contaminate each other's attendance reports"
tells a stakeholder everything they need; naming the query does not. The
mechanism goes in the technical notes, where it is useful.

## The technical notes

Everything the description is forbidden to say, said once, properly. This is
what stops the research from being thrown away — without it the planning stage
reopens every file you already read.

Write it for a developer who knows the language but has never seen this repo.
Worth carrying forward:

- **Where it lands** — the modules, files, and entities the change touches.
- **What already exists** — half-built pieces, the feature to imitate, the
  utility to reuse, the pattern this codebase follows for this kind of thing.
- **Constraints and gotchas** — auth boundaries, third-party services in play,
  data that must not move, the latent bug you found and how it actually works.

Keep it to what the research turned up. Do **not** write a build order, a
schema, an API design, or a file-by-file task list — that is the planning
stage, and it is not yours. Notes say *here is what is there*; a plan says
*here is what to do about it*. Leave the field empty if the research genuinely
turned up nothing worth carrying — that is rare, and it usually means the
research was thin.

### Every path is relative to the project root

`app/Http/Controllers/RfidController.php` — never
`/home/someone/projects/app/Http/Controllers/RfidController.php`, never
`C:\Users\...`, never `~/projects/...`.

Whoever reads this ticket has the repo checked out somewhere else entirely. An
absolute path is wrong for all of them, and it leaks the machine and username of
whoever ran this command. The same rule covers localhost dev-server URLs and any
personal directory name: if it only makes sense on one machine, it does not
belong in the ticket.

---

## 1. Confirm the link

Call `current_project`. If `{linked: false}`, tell the user to run
`/thedevelofurr:setup` first and stop — there is nowhere to file the ticket.

## 2. Research the codebase

Read the repo to ground the requirements in what actually exists — the real
roles, the real surfaces, the real constraints. Search and read; don't skim
filenames.

You are researching to write *accurate requirements*, not to design the
solution. The line: learning that the app already has a mailer and an
`auth` module is grounding, and belongs in the spec. Deciding which one sends
the reset email is design, and belongs to the planning stage.

Aim to answer, for this request specifically:

- **Where it lands** — the modules, routes, components, and entities the change
  touches. Note them as real paths.
- **What already exists** — half-built pieces, related features to imitate,
  utilities to reuse. A "forgot password" spec must know whether there is
  already an auth module, a mailer, a token table.
- **Who it's for** — the roles, permission levels, and account types this repo
  actually defines. These become the User Stories, so get them right.
- **The constraints** — auth boundaries, third-party services already in play,
  data that must not move, anything that limits what can reasonably be asked
  for. Constraints shape requirements; they aren't a design.

Be concrete about *behaviour*, never vague ("it should handle errors well").
But describe that behaviour in business language — what a person experiences,
what the system currently does to them, what must change. The file you found it
in is how you know it's true; it is not what you write in the description — it
goes in the technical notes instead, where a path is exactly what is wanted.

Keep the paths as you find them: **relative to the project root**. Your tools
will hand you absolute paths; strip the prefix before writing anything down.

## 3. Draft the ticket

### The description

Write it in GitHub-Flavored Markdown — it is parsed into a
BlockNote rich-text editor, so stick to headings, emphasis, fenced code blocks
with a language tag, bullet/numbered lists, `- [ ]` checklists, tables,
blockquotes and dividers, with a blank line between blocks. Raw HTML and other
unsupported syntax is flattened to plain text. Use these `##` sections in this
order:

- **## Overview** — one short paragraph: what this is and why it exists, in the
  context of this codebase.
- **## The Goal** — the outcome, from the user's point of view. One or two
  sentences. Not a task list.
- **## User Stories** — the feature from the perspective of the people who use
  it, one bullet each, in the standard form:

  > As a **\<role\>**, I want **\<capability\>**, so that **\<benefit\>**.

  Use the roles this system actually has — the ones you found in step 2 (its
  auth roles, permission levels, account types) — not invented personas. Cover
  every role the change touches, including the admin or operator side when
  there is one. The "so that" clause must carry real motivation; if it just
  restates the capability, the story isn't earning its place. Keep it to the
  handful that matter, and leave the mechanics for Requirements.
- **## Requirements** — what must be true when this is done. Bullets, each one
  concrete and testable, and each stated as observable behaviour rather than as
  a change to the code. Group them under `###` subsections when it helps, named
  for the part of the product a stakeholder would recognise ("Setting up a
  link", "Tapping in at another campus", "Reports") — not for the layer of the
  stack ("Backend", "Data").
- **## Acceptance Criteria** — a `- [ ]` checklist. Each item is something the
  stakeholder could confirm themselves by using the product — a thing they do,
  and what they should see. Not something only a developer could check by
  reading a database row. Every user story above
  must be covered by at least one criterion; a story nothing verifies is a gap.
  Include the failure and edge cases, not only the happy path.
- **## Open Questions** — *only if there are any.* Anything material that is
  genuinely undecided, where the answer would change what gets built. Number
  them, and for each say what it blocks and give a recommended default. Only
  real ambiguity belongs here — not questions the codebase already answers, and
  not questions that are really technical design decisions. If nothing is
  undecided, leave the section out entirely; an empty "Open Questions: none" is
  noise.

That is the whole description — every section of it written for the
stakeholder, and no **## Technical Notes** section at the end. Technical notes
are their own field now, not the last heading of this one.

**There is no implementation plan and no technical design here** — no
sequencing, no file-by-file steps, no schema or API design. Those belong to a
separate planning step that comes after this one, and they can't be decided
well until the requirements are agreed. A spec that quietly smuggles in a build
order has skipped that conversation.

### The technical notes

The second field, written to the rules in **The technical notes** above: what
the research found, for the developer who builds this. Same markdown support.
Short `##` sections or plain bullets — whatever suits what you found. Every
path relative to the project root.

### The title

It should read like a ticket: short, imperative, specific
("Add forgot-password flow with emailed reset tokens").

## 4. File it immediately

**Do not ask for approval, and do not print the draft for review first.** The
user asked for a ticket; create it. Revising afterwards is one `update_task`
call away, which is cheaper than making them read a wall of markdown in the
terminal and say "yes".

1. `kanban_manage` with `action: "list_boards"`.
2. If more than one board exists, ask which. If there's only one, use it.
3. `kanban_manage` with `action: "get_board"` to read the real columns.
4. Pick the intake column — the leftmost / backlog-style column (often "To Do").
   If the naming is ambiguous, ask.
5. `kanban_manage` with `action: "create_task"`, passing `boardId`, `columnId`,
   `title`, the full `description`, and the `technicalNotes`. Both bodies go in
   the one call — filing the ticket and then patching the notes on is two round
   trips and leaves the card half-written in between.

Use the exact IDs the API returned. Never invent an ID, a board, or a column.

Before sending, reread `technicalNotes` for absolute paths and rewrite any you
find as relative to the project root. This is the one thing easiest to get
wrong, because your tools report paths the other way.

Those two questions in steps 2 and 4 are the only ones allowed here, and only
when the board or column genuinely can't be resolved on its own. Everything
else proceeds without checking in.

## 5. Report

Keep it short. The ticket is on the board — the user will read it there, so
don't reproduce the description in the terminal.

`create_task` returns the created task, including its `reference` — the id the
board shows and the one `/thedevelofurr:implement` takes — and a `_link`. Lead
with the reference and give the link as a clickable URL on its own line:

```
Created **APRAS-004 — Add forgot-password flow with emailed reset tokens** in To Do.

https://thedevelofurr.online/projects/.../tasks/...

4 user stories, 11 requirements, 9 acceptance criteria, plus technical notes on
the Technical tab. 3 open questions at the bottom — worth settling before
planning.
```

Then add a one-line summary: how many user stories, requirements, and
acceptance criteria, that the research is on the Technical tab, and the number
of open questions if there are any.

Planning is the next step, not this one. You may say the spec is ready to plan
against; do not start planning it, and do not attach a plan to the report.

If the tool returns no `_link`, say the task was created and that no URL came
back — don't construct a URL by hand.

---

## Notes

- The ticket is the deliverable, and the only one. See **the one hard rule**
  above: research is read-only, nothing in the repo gets written, and the run
  ends when the ticket exists.
- Scope the spec to what was asked. Note adjacent work you spotted under Open
  Questions rather than quietly widening the ticket.
- If the request is large enough to be several tickets, still file one ticket
  now — don't stop to propose a split. Note the suggested breakdown under Open
  Questions, and offer in your report to split it into separate tickets.
