# Deploying plugin updates

## Current state

The plugin is only distributed via a **local marketplace**: the repo root has
`.claude-plugin/marketplace.json` (marketplace name `junalcantara`) pointing at
`./ai-project-manager-plugin` (plugin name `thedevelofurr`, version tracked in
`ai-project-manager-plugin/.claude-plugin/plugin.json`). This only works for
installs where the user has this repo checked out locally at a known path —
there is no public/hosted marketplace yet.

`api_url` has no separate env-var override — it's sourced entirely from the
plugin's `userConfig.api_url` (see `.mcp.json`'s
`"API_URL": "${user_config.api_url}"`), which defaults to
`http://localhost:3001`. Decision (2026-07-27): leave this default as-is for
now rather than pointing it at production. Anyone using the plugin against the
live backend at `https://thedevelofurr.online/` must set that manually via
`/plugin config thedevelofurr` after installing.

## Updating an existing local install

After editing anything under `ai-project-manager-plugin/` (commands, skills,
`mcp-server.js`):

1. Bump `"version"` in `ai-project-manager-plugin/.claude-plugin/plugin.json`.
2. On any machine with the plugin installed: `/plugin marketplace update junalcantara`
3. Restart Claude Code to pick up the new commands/skills/MCP server code.

## Publishing for real (not yet done)

To let people install this without cloning the repo, the marketplace
definition needs to live somewhere fetchable independent of a local path —
e.g. a dedicated public git repo (or this repo made public) containing (or
pointing to) `.claude-plugin/marketplace.json`. Once that exists, installs
become:

```
/plugin marketplace add <git-url-or-repo-slug>
/plugin install thedevelofurr@junalcantara
```

Steps not yet done, in rough order:
1. Decide where the marketplace source lives (public repo, or a dedicated
   marketplace-only repo referencing this plugin).
2. Confirm the plugin directory is self-contained (no relative imports
   outside `ai-project-manager-plugin/`) so it can be referenced from a
   separate marketplace repo if needed.
3. Re-check whether `api_url`'s default should change once there's a
   non-technical audience installing it (currently left as `localhost:3001`
   per the decision above — revisit if that causes confusion for non-dev
   users).
4. Write install instructions for end users (README section or a docs site),
   including how to generate a project API token (Project → Settings → MCP →
   Create Token in the web app).
