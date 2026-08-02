---
name: implement
description: Pick up a task from the board, cut a branch, build it, push it, and report back on the card.
argument-hint: [task reference, e.g. APRAS-001 — leave empty to see what is ready]
---

Build a ticket that is already on the board. This is the **third** stage —
**specify → plan → implement** — and it is the one that writes code.

Task: **$ARGUMENTS**

## The shape of a run

1. Find the task.
2. Refuse to start if anything in it is still an open question.
3. Cut a branch from main, and write it back to the card.
4. Implement it.
5. Push the branch and comment on the card.

Steps 3 and 5 are not optional and not negotiable — a run that builds
something without recording where the work lives is a run nobody else can
follow.

---

## 1. Find the task

Call `current_project`. If `{linked: false}`, tell the user to run
`/thedevelofurr:setup` first and stop.

**With a reference** (`APRAS-001`, or just `apras-001` — case does not matter):
call `kanban_manage` with `action: "get_task"` and `reference`. That resolves
across every board in the project, so no `boardId` is needed. If nothing comes
back under that reference, say so and show the intake list below rather than
guessing at a task with a similar name.

**With no argument**: call `list_boards`, then `get_board` for each, and show
what is waiting to be picked up — the tasks in the intake column (the
leftmost / "To Do"-style one) of every board:

```
Ready to pick up:

  APRAS-004  Add forgot-password flow with emailed reset tokens
  APRAS-007  Let a campus admin export attendance as CSV
  APRAS-011  Refuse a visitor card at the door
```

Then stop and let them choose. Do not pick one yourself.

Read the whole task before doing anything else: **both** bodies —
`description` for what must be true, `technicalNotes` for where it lands — and
**every comment**, which is where decisions taken since the ticket was filed
live.

## 2. Open questions block the run

A ticket with an unanswered question in it is a ticket that has not been
decided. Building it means guessing, and a guess discovered at review time
costs more than the question did.

Look for an `## Open Questions` section in the description. For each question,
check the comments — this is where answers get recorded, so a question answered
in a comment is a question closed.

**If every question is answered**, say which comment answered what in a
sentence, and carry on.

**If any question is unanswered**, stop before touching the repo and offer both
ways to settle it:

```
APRAS-004 has 2 unanswered questions:

  1. Should a reset link expire after 1 hour or 24 hours?
  2. Do we email the user when their password is changed by someone else?

Answer them here and I will record them on the card and start, or answer them
in the comments on the card and re-run this command.

https://thedevelofurr.online/projects/.../kanban/...
```

If they answer in this session, **post their answers as a comment first**
(`action: "create_comment"`, with `reference`), then start. The card has to
carry the decision — the next person to open it will not have this terminal
window. Format the comment so it is obvious what was decided:

```markdown
## Open questions answered

**1. Should a reset link expire after 1 hour or 24 hours?**
1 hour.

**2. Do we email the user when their password is changed by someone else?**
Yes, to the old address as well as the new one.
```

Do not answer the questions yourself, and do not proceed on a recommended
default without the user saying so. The point of the section is that these are
not yours to decide.

## 3. Cut the branch, then write it back to the card

Always a new branch, always from the project's main line. Never build on
whatever branch happens to be checked out.

1. Check the worktree is clean (`git status --porcelain`). If it is not, show
   what is uncommitted and stop — stashing or committing someone else's work in
   progress is not this command's call.
2. Work out the main line: `main` if it exists, otherwise `master`, otherwise
   whatever `git symbolic-ref refs/remotes/origin/HEAD` reports. If there is no
   obvious one, ask.
3. `git fetch origin`, then branch from the remote tip
   (`git switch -c <branch> origin/<main>`) so the work starts from what is
   actually released, not from a local copy that has been sitting for a week.
   With no remote, branch from the local main line instead.
4. Name it from the reference and the title, lowercased and hyphenated:
   `feature/apras-004-forgot-password-flow`. Keep it under about 60 characters
   — trim the title, never the reference. Use `fix/` instead of `feature/` when
   the ticket is plainly a bug.
5. Immediately call `kanban_manage` with `action: "update_task"`, the
   `reference`, and `branch` set to the name you just created.

That last step happens **before** the first line of code, not after. If the run
is interrupted halfway, the card still says where to look.

If the card already carries a branch, do not silently start a second one. Say
what is already there and ask whether to continue on it or cut a fresh one.

## 4. Implement it

The description says what must be true; the technical notes say what the repo
already looks like. Follow the codebase's own conventions over any general
habit — match the patterns in the files you are editing.

Work through the **Acceptance Criteria** as the definition of done. Every
criterion is something that should hold when you finish; if one turns out to be
impossible or wrong, that is a thing to raise in the comment at the end, not to
quietly drop.

Run whatever the project uses to check itself — tests, typecheck, linter — and
fix what your change broke. Do not fix unrelated pre-existing failures; note
them instead.

Commit as you go, in coherent steps, with the reference in the message:

```
APRAS-004: add reset-token table and expiry

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

If the ticket turns out to be bigger than it looked, or blocked by something
real, stop and say so. Half a feature pushed with a confident comment is worse
than an honest report.

## 5. Push, then report on the card

Push the branch to the remote:

```
git push -u origin <branch>
```

If there is no remote, say so plainly and skip the push — do not add one.

Then `kanban_manage` with `action: "create_comment"`, the `reference`, and a
comment that someone who has not read the diff can follow. Markdown, rendered
in a rich-text editor:

```markdown
## Implemented on `feature/apras-004-forgot-password-flow`

Pushed 4 commits.

**What changed**
- Reset tokens are stored with a 1-hour expiry and consumed on first use.
- The reset email goes out through the existing mailer.
- Both the requester and the old address are notified on a password change.

**Acceptance criteria**
- [x] A user who forgets their password receives a reset link by email
- [x] A link older than an hour is refused with a clear message
- [ ] The link is single-use — see the note below

**Worth knowing**
- Single-use is enforced per token, but two links requested in the same minute
  are currently both valid. Raised as a follow-up rather than widened here.
- `npm test` passes; three tests in the billing suite were already failing on
  main and were left alone.
```

Cover what changed, which acceptance criteria hold, anything left undone and
why, and any decision made along the way that a reviewer would otherwise have
to reverse-engineer. Every path in it is **relative to the project root** —
never `/home/someone/...`, never `C:\Users\...`. Whoever reads the card has the
repo somewhere else entirely.

## 6. Report in the terminal

Short. The branch name, the number of commits, and the comment link — the
detail is on the card, so don't reprint it here.

Do not open a pull request unless asked. Pushing the branch is where this
command ends.

---

## Notes

- Scope is the ticket. Something adjacent that also needs doing goes in the
  closing comment as a follow-up, not into this branch.
- Never edit the `description` to answer its own open questions. Answers go in
  comments; the description is the requirement.
- The reference never changes and is never reused, which is why it is safe in a
  branch name and a commit message. Use it in both.
