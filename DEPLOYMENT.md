# Deploying plugin updates

## Where this lives

This directory is both the **marketplace** and the **plugin**:

- `.claude-plugin/marketplace.json` — marketplace `junalcantara`, one plugin
  entry `thedevelofurr` with `"source": "./"`.
- `.claude-plugin/plugin.json` — the plugin manifest, including `version` and
  the `userConfig` schema.

It is developed inside the private `Jun-Alcantara/ai-project-manager` monorepo
at `ai-project-manager-plugin/`, and published to the public repo
[`Jun-Alcantara/cloud-context`](https://github.com/Jun-Alcantara/cloud-context),
whose root is this directory. There is no second checkout and no copying: the
two are the same files, connected by `git subtree`.

The backend URL is **not** user config — as of v0.6.0 the plugin ships pointing
at `https://thedevelofurr.online` (`DEFAULT_API_URL` in `mcp-server.js`), and
installing asks only for an API token. Self-hosters and local development use
the `AIPM_API_URL` env var; see
[README.md](README.md#pointing-at-a-different-backend).

## Shipping a change

From the monorepo root:

1. Make the change under `ai-project-manager-plugin/`.
2. Bump `"version"` in `.claude-plugin/plugin.json`. `mcp-server.js` also
   hard-codes the version in two places (`initialize` and `diagnostics`) — bump
   those in the same commit.
3. Commit to `main`.
4. Publish:

   ```
   git subtree push --prefix=ai-project-manager-plugin cloud-context main
   ```

5. Users pick it up with `/plugin marketplace update junalcantara`, then a
   Claude Code restart.

Claude Code installs from `cloud-context`'s **default branch**, so nothing is
live until step 4 lands on `main`.

The `cloud-context` remote is per-clone; on a fresh checkout of the monorepo,
add it once:

```
git remote add cloud-context git@github.com:Jun-Alcantara/cloud-context.git
```

If `subtree push` is rejected as non-fast-forward, someone committed directly to
`cloud-context`. Pull that work back down rather than forcing over it:

```
git subtree pull --prefix=ai-project-manager-plugin cloud-context main --squash
```

## Installing

See [README.md](README.md).
