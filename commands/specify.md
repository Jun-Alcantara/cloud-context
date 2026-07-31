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

## The one hard rule: specify only — no plan, no code

This is the **first** of three separate stages: **specify → plan → implement**.
This command owns the first one and stops there. It produces a requirements
document: *what* is being built and *why*. **How** is the planning stage's job,
and writing it is the implementation stage's. Collapsing them defeats the point
of having them.

For the whole run you are **read-only on the repo**. Do not create, edit, or
delete a single file. Do not run migrations, generators, installs, formatters,
or tests. Do not start a branch, a commit, or a PR. The only thing this command
writes anywhere is the kanban ticket.

The ticket itself stays at the requirements level too — it describes *what must
be true*, not *the code that makes it true*. There is **no code in the ticket at
all**: no function bodies, no queries, no migrations, no diffs, not even a one-
line signature. And no code-shaped names either — see **Who reads this** below,
because the audience is the reason.

Finish by handing over the ticket. **Do not offer to plan or start building,
and do not begin either if the user seems eager.** The next stage is a
separate, explicit request. If they want it, they'll ask.

## Who reads this: stakeholders, not developers

Write for the person who decides *whether* this gets built — a founder, a
client, a product owner, a school administrator. Assume they have never opened
the codebase and do not read code. If a sentence would make them stop and ask
"what does that mean?", it has failed, no matter how precise it is.

**Never put these in the ticket:**

- Code of any kind — snippets, fenced blocks, function bodies, queries, diffs.
- Class, method, or constant names: `RfidController::tap()`, `Role::SUPER_ADMIN`,
  `SchoolSetting`.
- Table and column names: `users.school_id`, `rfid_logs`, `schools.is_active`.
- Query or ORM fragments: `->first()`, `whereUid(...)`, `SELECT`.
- Framework vocabulary: controller, middleware, migration, endpoint, route,
  model, index, foreign key, nullable, JSON response.
- File paths, in the body of the document.

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
tells a stakeholder everything they need; naming the query does not.

## Paths and names

If a path is genuinely unavoidable, it must be **repo-relative** —
`app/Http/Controllers/RfidController.php`, never
`/home/someone/projects/app/...`. Absolute paths leak your machine's layout and
username, and they are wrong for every other developer who clones the repo
somewhere else. The same goes for URLs to local dev servers and any personal
directory name.

In practice the body of a stakeholder document needs no paths at all. If the
research turned up specifics worth preserving for the planning stage, put them
in a short **## Technical Notes** section at the very end, clearly marked as
notes for the implementer rather than part of the requirements — and keep every
path in it relative. Omit the section entirely when there is nothing to say.

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
in is how you know it's true; it is not what you write down. See **Who reads
this** below.

## 3. Draft the ticket

Write the description in GitHub-Flavored Markdown — it is parsed into a
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
- **## Technical Notes** — *only if the research turned up something the
  planning stage would otherwise have to rediscover.* The one place where
  specifics are allowed: relative paths, and the names of things that already
  exist. Keep it to a few bullets, mark it plainly as notes for the implementer
  and not part of the requirements, and still write no code. Omit it entirely
  when there's nothing worth carrying forward.

Every section above it is written for the stakeholder. This last one is the
exception, and it earns that by being clearly fenced off — not by letting
technical language drift back up into the rest of the document.

That's the whole document. **There is no implementation plan and no technical
design here** — no sequencing, no file-by-file steps, no schema or API design.
Those belong to a separate planning step that comes after this one, and they
can't be decided well until the requirements are agreed. A spec that quietly
smuggles in a build order has skipped that conversation.

The title should read like a ticket: short, imperative, specific
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
   `title`, and the full `description`.

Use the exact IDs the API returned. Never invent an ID, a board, or a column.

Those two questions in steps 2 and 4 are the only ones allowed here, and only
when the board or column genuinely can't be resolved on its own. Everything
else proceeds without checking in.

## 5. Report

Keep it short. The ticket is on the board — the user will read it there, so
don't reproduce the description in the terminal.

`create_task` returns a `_link`. Give it as a clickable URL on its own line:

```
Created **Add forgot-password flow with emailed reset tokens** in To Do.

https://thedevelofurr.online/projects/.../tasks/...

4 user stories, 11 requirements, 9 acceptance criteria. 3 open questions at the
bottom — worth settling before planning.
```

Then add a one-line summary: how many user stories, requirements, and
acceptance criteria, plus the number of open questions if there are any.

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
