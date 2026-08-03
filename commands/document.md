---
name: document
description: Write already-made changes up onto the board — file the ticket after the fact, record the branch, and close it out in Done.
argument-hint: [task reference if the card already exists — leave empty to work from the current branch]
---

The work is already done. This command runs the pipeline **backwards** — code
first, ticket after — so a branch that exists in git also exists on the board.

Argument: **$ARGUMENTS**

Empty is the normal case: document whatever is on the current branch. A
reference (`APRAS-004`) means the card already exists and you were told which
one, so skip the search in step 2.

## What this command is for, and what it is not

`/thedevelofurr:specify` and `/thedevelofurr:implement` assume you started at
the board. Often you didn't — you fixed something, cut a branch, pushed it, and
the board never heard about it. This closes that gap.

It is **not** a way to skip specifying. The ticket it writes is a record of work
that happened, filed straight into Done. Nobody is going to decide whether to
build this; they already built it.

## This command owns no ticket format of its own

The shape of a ticket and the shape of a closing comment live in the two
commands this one borrows from. Do not work from memory of them — **read both
files now**, before anything else:

1. `${CLAUDE_PLUGIN_ROOT}/commands/specify.md` — for the ticket itself
2. `${CLAUDE_PLUGIN_ROOT}/commands/implement.md` — for its step 5, the closing
   comment

If `${CLAUDE_PLUGIN_ROOT}` does not resolve to a real directory, find the
sibling files next to this one and read them from there. Those two are the
source of truth for format and they will change over time; this file only says
how a backwards run differs from a forwards one. Where they and this file
disagree on anything not listed under **The overrides**, they win.

---

## The shape of a run

1. Establish what changed, and refuse if there is nothing to document.
2. Find the card, if there already is one.
3. Ask the user what this was for. The diff cannot tell you.
4. File the ticket, if there wasn't one.
5. Record the branch, comment, move to Done, push if unpushed.

---

## 1. Establish what changed

Call `current_project` first. If `{linked: false}`, tell the user to run
`/thedevelofurr:setup` and stop.

Work out the main line the same way `implement.md` step 3 does: `main`, else
`master`, else whatever `git symbolic-ref refs/remotes/origin/HEAD` reports.
Then `git fetch origin` so "not merged yet" is measured against what is actually
released.

**The changes are everything from `git merge-base origin/<main> HEAD` to the
working tree** — commits and uncommitted edits together. One definition covers
all three states this command exists for: uncommitted, committed-unpushed, and
pushed-unmerged.

Two refusals, both hard:

- **Nothing changed.** No commits ahead of the main line and a clean worktree —
  there is nothing to write up. Say so and stop.
- **Already merged.** The branch's commits are all reachable from
  `origin/<main>` (`git branch --merged origin/<main>` lists it, or the merge
  base is HEAD). This command documents work that is still in flight. Merged
  work belongs to whatever record was made at merge time; filing a Done ticket
  for it now just adds a duplicate nobody asked for. Say so and stop.

### If HEAD is the main line

Real changes, not merged, but no branch to record them on. Offer to move them —
and be explicit about what will move, because rewriting where `main` points is
not something to do quietly:

```
You have 3 commits and 2 uncommitted files on main.

I can move them onto a branch: cut the branch here, then point main back at
origin/main. Nothing is lost — every commit ends up on the new branch — but
your local main stops carrying them.

Want me to? I'll name the branch after the ticket once it's filed.
```

Stop and wait. If they decline, stop the run; there is nothing useful to record
without a branch. If they agree, **do it in step 5**, not now — the branch is
named from the reference, and for a run with no existing card the reference does
not exist until the ticket is filed.

The move, when you get to it, is two steps and no more: `git switch -c <branch>`
from where you are, which carries the uncommitted edits across untouched, and
then `git branch -f <main> origin/<main>` to put the main pointer back. Never
`reset --hard`, never stash. If local main holds commits that are *not* part of
this work, do not move anything — say which ones and let the user sort it out.

### Reading the diff

`git log --oneline` and `git diff --stat` against the merge base first, to see
the size. Then read for meaning, not for completeness: the commit messages, and
the files that carry the change rather than every file touched. On a large
branch, walk it commit by commit instead of pulling one enormous diff.

You need enough to describe *what the change does*. You do not need to
reconstruct every line — the diff already exists and is a better record of
itself than any summary you write.

## 2. Find the card

The work may already have a ticket — one made by `/thedevelofurr:implement`, or
one filed and then drifted away from.

- **A reference in `$ARGUMENTS`** — use it. `get_task` with that `reference`.
- **A reference in the commit messages** — `implement.md` requires one in every
  commit, so `git log` on the branch usually names its own ticket. Take the
  first `ABCD-123` you find and `get_task` it.
- **Otherwise** — `list_boards`, then `get_board` on each, and look for a task
  whose `branch` matches the current branch. There is no server-side lookup by
  branch, so this is a client-side scan.
- **Nothing matches** — no card. That is the common case and it is fine.

If a card turns up whose `branch` is set to something *else*, do not overwrite
it. Show both branch names and ask which is right.

## 3. Ask what it was for

**Do not skip this.** A ticket written only from the diff restates the diff, and
the diff is right there — such a card is worth nothing to whoever opens it.
Everything of value here is the part git did not record.

Say what you found, then ask. Two questions, and keep them short:

```
On `fix/rfid-tap-timeout` — 3 commits: the tap handler now retries twice
before giving up, and the timeout moved from 2s to 5s.

Before I write this up:

  1. What was this for — what was going wrong?
  2. Anything you deliberately left out or decided against?
```

Stop and wait. If they answer the first and skip the second, that's an answer.
If they tell you to just write it from the diff, do that — but say in the ticket
that the rationale wasn't recorded, rather than inventing one.

If the card already exists, its description is the intent — you have your
answer. Ask only the second question, about what was left out.

## 4. File the ticket

Only when there is no card. Follow `specify.md`'s format exactly: two separate
bodies, description for the stakeholder with no code and no paths in it,
technical notes for the implementer with every path relative to the project
root. The description says what the change makes true and why — from their
answer in step 3, grounded by the diff.

Two things differ from a forwards run, and both are in **The overrides** below:
acceptance criteria are checked against the code that exists, and the ticket is
created straight into the **Done** column.

Finding Done: `get_board` and take the column named `Done` — or `Complete`,
`Shipped`, or whatever that board calls its last one. If the rightmost column is
plainly it, use it. If the board has nothing that reads as finished, ask which
column to use rather than guessing.

## 5. Record the branch, close it out

In this order:

1. **Move the changes off main**, if step 1 asked and the user agreed. Branch
   name comes from the reference and title, exactly as `implement.md` step 3
   names it: `fix/apras-012-rfid-tap-timeout`. An existing branch keeps whatever
   name it already has — never rename a branch that may be pushed.
2. **Commit anything uncommitted**, in coherent steps, with the reference in the
   message. Same format as `implement.md` step 4. Work that is only in the
   working tree is not documented by a card that points at a branch.
3. **`update_task`** with the `reference` and `branch` set.
4. **`create_comment`** — `implement.md` step 5's format, unchanged. What
   changed, which acceptance criteria hold, what was left undone and why, and
   any decision a reviewer would otherwise have to reverse-engineer. Every path
   relative to the project root.
5. **`move_task`** into Done, if the card already existed elsewhere on the
   board. A ticket filed in step 4 is already there.
6. **Push**, if the branch has no upstream: offer it, and push with
   `git push -u origin <branch>` if they say yes. Do not push silently — an
   unpushed branch is sometimes unpushed on purpose. No remote at all: say so
   and skip it.

## 6. Report in the terminal

Short. What was filed or updated, the branch, and the link.

```
**APRAS-012 — RFID taps fail silently when the reader is slow to answer**

Filed in Done from 3 commits on `fix/rfid-tap-timeout`, pushed.
One acceptance criterion left unchecked — see the comment.

https://thedevelofurr.online/projects/.../tasks/...
```

---

## The overrides

Everything else in `specify.md` and `implement.md` is unchanged. These five are
the places a backwards run genuinely differs.

### 1. `specify.md` is no longer read-only on the repo

Its hard rule exists so that specifying does not quietly turn into building.
Here the building already happened, so the rule has nothing left to protect.
This run commits, branches, and pushes.

What still holds: **no new feature work**. Something the diff should have done
and didn't goes in the comment as a follow-up. Do not fix it on the way past.
The card must describe the branch as it actually is.

### 2. Acceptance criteria get checked against the code, and may fail

`specify.md` writes criteria for work not yet done. Here the code exists, so
write them from the *intent* the user gave in step 3 — then check each one
against what the diff actually does, and tick it in the closing comment exactly
as `implement.md` does.

Criteria derived from the diff are worthless: they cannot fail, and a checklist
that cannot fail proves nothing. Write what should be true, then look. **An
unchecked box is a good outcome, not a failed run** — it is the one thing this
command can tell the user that they did not already know.

### 3. There is no open-questions gate

`implement.md` refuses to build while a question is open, because building on a
guess costs more at review time. There is nothing left to build here, so there
is nothing to gate.

Do not write an `## Open Questions` section. A decision that was made during the
work and might be revisited goes in the closing comment under **Worth knowing**.
A question the code genuinely leaves open goes there too, as a follow-up.

### 4. The ticket is filed into Done

Not the intake column. The work is finished; a completed change sitting in To Do
misreports the state of the project to everyone looking at the board.

### 5. One report at the end, not two

`specify.md` and `implement.md` each end with one. Give a single report, at the
very end, in the form above.

---

## Notes

- Scope is the branch. If it turns out to carry two unrelated changes, say so
  and ask whether to file one ticket or two — do not split the commits.
- Do not open a pull request unless asked.
- Never edit a description to record what was decided during the build. The
  description is the requirement; decisions go in comments. That rule survives
  the direction reversal intact.
