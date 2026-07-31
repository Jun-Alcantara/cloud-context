---
name: update
description: Update this plugin to the latest version from its marketplace.
---

Pull the newest version of the AI Project Manager plugin and report what
changed. Everything here runs through the `claude` CLI in Bash — `/plugin` is an
interactive command you cannot invoke.

## 1. Find the current install

```bash
claude plugin list
```

Read off the entry for **`thedevelofurr`**: its version, its marketplace (the
part after `@`), and its scope. Note the version — it's the "before" number.

If it isn't listed, the plugin isn't installed under this account. Say so and
stop; there's nothing to update.

Don't assume the marketplace is named `junalcantara` — use whatever `list`
reports, and pass the same `--scope` if it's anything other than `user`.

## 2. Refresh the marketplace, then the plugin

```bash
claude plugin marketplace update <marketplace>
claude plugin update thedevelofurr@<marketplace>
```

Both must succeed. If the marketplace refresh fails — network, a moved repo, a
deleted local directory — report the error verbatim and stop rather than
running the second command against stale metadata.

## 3. Confirm the new version

```bash
claude plugin list
```

Compare against the "before" number and tell the user which way it went:

- **Version went up** — say `0.10.1 → 0.11.0` plainly.
- **Version unchanged** — already current. Say so; don't imply an update
  happened. One case looks like this but isn't: a marketplace whose source is a
  local **Directory** reads `plugin.json` straight off disk, so its version is
  always current and `update` is a no-op by design. Check
  `claude plugin marketplace list` — if the source is a Directory, the version
  was never stale and a restart is the only thing that was ever needed.

## 4. Tell them to restart

**The new version does not take effect in the running session.** Commands,
skills, and the MCP server are all loaded at startup, so a plugin updated
mid-session keeps running the old code until Claude Code restarts. You cannot
restart it yourself — ask the user to do it.

Be concrete about what's still stale: a new command added by the update will
not appear in this session's command list, and calling it will fail.

## 5. Report

One short summary: the version change (or that it was already current), and the
restart instruction. If you know what shipped in the new version — from the
repo's git log — mention it in a line or two. Don't invent a changelog you
haven't read.

---

## Notes

- This updates the **installed** plugin from its marketplace. It does not
  publish anything, and it does not touch the plugin source in this repo.
- Nothing here needs a linked project or a valid API token — it's install
  management, not a backend call. Don't run `diagnostics` first.
