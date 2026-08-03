---
name: ship
description: Spec a feature into a ticket, settle its open questions with you, then build it and push — specify and implement in one run.
argument-hint: [what you want to build, in plain words]
---

The user wants a feature built, end to end, in one sitting. This command runs
**specify → implement** back to back: it files a real spec ticket first, settles
anything undecided with the user right there, and then builds it.

Feature request: **$ARGUMENTS**

If that is empty, ask what they want to build and stop until they answer.

## This command owns no rules of its own

Everything about *how* to spec and *how* to build lives in the two commands this
one composes. Do not work from memory of them — **read both files now**, before
anything else, and follow them as written:

1. `${CLAUDE_PLUGIN_ROOT}/commands/specify.md`
2. `${CLAUDE_PLUGIN_ROOT}/commands/implement.md`

If `${CLAUDE_PLUGIN_ROOT}` does not resolve to a real directory, find the plugin
directory yourself — the sibling `specify.md` and `implement.md` next to this
file — and read them from there. Do not continue without having read both; a run
that guesses at their contents will get the ticket format, the branch rules, or
the closing comment wrong, and those are the parts that outlive this session.

Those two files are the source of truth and they will change over time. This
file only says how they are joined, and the short list of overrides below. Where
they and this file disagree on anything else, **they win**.

---

## The shape of a run

1. **Specify** — run `specify.md` in full: research, draft, file the ticket.
2. **Settle** — if the ticket has open questions, ask them here and now, and
   record the answers on the card.
3. **Implement** — run `implement.md` from its step 3 onward: branch, build,
   push, comment.
4. **Report** — one report, covering both halves.

The ticket exists on the board before any code is written. That ordering is the
point of this command: the work is recorded whether or not the build finishes,
and the card carries the requirements someone can review the branch against.

---

## The overrides

Exactly four places where a run here differs from running the two commands
separately. Everything else is unchanged.

### 1. `specify.md` still files the ticket first — and it still writes no code

Its hard rule — read-only on the repo, nothing but the ticket gets written —
holds for the whole of stage 1, right up to `create_task` returning. Do not
start branching or editing early because you can already see how to build it.

What lapses at that boundary is only its closing instruction to hand over and
stop. Here, filing the ticket is a milestone, not the end of the run.

### 2. Open questions get asked in the chat, immediately

`specify.md` writes an `## Open Questions` section and moves on;
`implement.md` refuses to build while any question is unanswered. Here you have
the user in front of you, so close the gap directly:

As soon as the ticket is filed, if it has open questions, ask them — numbered,
each with what it blocks and your recommended default, exactly as they are
written on the card:

```
APRAS-004 is filed, with 2 open questions I need before I build:

  1. Should a reset link expire after 1 hour or 24 hours?
     Blocks: the expiry check. Suggested: 1 hour.
  2. Do we email the user when their password is changed by someone else?
     Blocks: whether a second notification goes out. Suggested: yes.

Answer both and I'll record them on the card and start.
```

Then stop and wait. Do not answer them yourself, do not build on the suggested
default without the user choosing it, and do not start "the parts that aren't
blocked" while you wait — a spec with an open question is a spec that has not
been decided.

When they answer, post the answers as a comment on the card **before** touching
the repo, in `implement.md`'s "Open questions answered" format. The card has to
carry the decision; the next person to open it will not have this terminal
window.

If the ticket has no open questions, say so in one line and go straight on.

### 3. `implement.md` starts at its step 3

Skip its steps 1 and 2. You already know the task — you just wrote it — and you
have the `reference` from `create_task`, so there is nothing to look up and
nothing to re-read. Its open-questions gate has been satisfied by the override
above.

Everything from **step 3 onward is unchanged and not optional**: clean worktree,
fresh branch from the remote main line, `update_task` writing the branch back to
the card *before* the first line of code, acceptance criteria as the definition
of done, the project's own tests and checks, the reference in every commit
message, the push, and the closing comment on the card.

### 4. One report at the end, not two

`specify.md` and `implement.md` each end with a report. Give one instead, at the
very end, and keep it short — the detail is on the card:

```
**APRAS-004 — Add forgot-password flow with emailed reset tokens**

Specced, then built on `feature/apras-004-forgot-password-flow` — 4 commits, pushed.
2 open questions answered above are recorded on the card.

https://thedevelofurr.online/projects/.../tasks/...
```

If the run stops early — unanswered questions, a dirty worktree, a ticket that
turns out to be bigger than it looked — report what *did* happen. The ticket is
filed and that is real progress; say where it stopped and what would restart it
(`/thedevelofurr:implement <reference>` picks the ticket back up from the board).

---

## Notes

- Scope is the sentence the user gave. If the research says it is really several
  tickets, file the one ticket, note the breakdown under Open Questions, and ask
  which part to build now rather than building all of it.
- Do not open a pull request unless asked. Pushing the branch ends the run, same
  as `implement.md`.
- Both halves of the ticket keep their rules: no code and no paths in the
  description, the research in the technical notes, every path relative to the
  project root — in the ticket *and* in the closing comment.
