# Deploying plugin updates

## Current state

The plugin is only distributed via a **local marketplace**: the repo root has
`.claude-plugin/marketplace.json` (marketplace name `junalcantara`) pointing at
`./ai-project-manager-plugin` (plugin name `thedevelofurr`, version tracked in
`ai-project-manager-plugin/.claude-plugin/plugin.json`). This only works for
installs where the user has this repo checked out locally at a known path —
there is no public/hosted marketplace yet.

**The backend URL is not user config.** As of 2026-07-30 (v0.6.0) the plugin
ships pointing at `https://thedevelofurr.online`, hardcoded as
`DEFAULT_API_URL` in `mcp-server.js`; installing asks only for an API token,
the way any other app works. This replaced two earlier positions in quick
succession: a `userConfig.api_url` defaulting to `http://localhost:3001`
(sensible only while the plugin was installed from a local checkout), then the
same field defaulting to production. Both asked users a question they have no
way to answer.

Developers and self-hosters override it with the `AIPM_API_URL` env var in the
environment that launches Claude Code:

```
AIPM_API_URL=http://localhost:3001 claude
```

`diagnostics` reports the URL in effect and its origin (`api_url` /
`api_url_source`).

## Updating an existing local install

After editing anything under `ai-project-manager-plugin/` (commands, skills,
`mcp-server.js`):

1. Bump `"version"` in `ai-project-manager-plugin/.claude-plugin/plugin.json`.
2. On any machine with the plugin installed: `/plugin marketplace update junalcantara`
3. Restart Claude Code to pick up the new commands/skills/MCP server code.

## Public distribution (since 2026-07-30)

The plugin is published from the public repo
[`Jun-Alcantara/cloud-context`](https://github.com/Jun-Alcantara/cloud-context),
which holds a copy of this directory at its root plus its own
`.claude-plugin/marketplace.json` (same marketplace name, `junalcantara`).
End users install with:

```
/plugin marketplace add Jun-Alcantara/cloud-context
/plugin install thedevelofurr@junalcantara
```

This directory stays the source of truth. To ship a change: bump `version` in
`.claude-plugin/plugin.json`, copy this directory's contents over the root of a
`cloud-context` checkout (keeping that repo's `README.md`, `DEPLOYMENT.md`, and
`.claude-plugin/marketplace.json`), commit, and push to `main` — Claude Code
installs from the default branch only.

Note both marketplaces are named `junalcantara`, so a single machine should add
either the local one or `cloud-context`, not both.
