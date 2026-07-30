---
name: reset
description: Reset the AI Project Manager connection, or unlink this directory entirely.
---

Use this when tool calls are failing with session or connection errors, or when
the user wants to point this directory at a different project.

1. Decide the mode from what the user asked for:
   - **Reconnect only** (default) — run `reset_connection` with no arguments.
     Keeps the project link, drops the backend session, reconnects.
   - **Unlink** — run `reset_connection` with `unlink: true`. This deletes
     `.ai-project-manager.json`. Confirm with the user before doing this,
     and say the file will be deleted.

2. Report the result from the tool's response:
   - `reconnected: true` → tell the user the connection is healthy and retry
     whatever failed.
   - `reconnected: false` with an `error` → run `diagnostics` and present what
     it says (API reachable? token valid?). A 401 means the API token is bad —
     point them at Project → Settings → MCP for a new one and `/plugin` to
     update it.
   - `unlinked: true` → tell the user this directory is no longer linked, then
     offer to run `/thedevelofurr:setup` to link a project.

Notes:
- `reset_connection` only resets *this* directory's session and link. It never
  touches the API token or anything server-side — no tokens are revoked and no
  project data is deleted.
- Stale-session errors (`SSE rpc failed: HTTP 404`) normally recover on their
  own now: the bridge reconnects and retries once. Reach for this command when
  that automatic retry wasn't enough.
