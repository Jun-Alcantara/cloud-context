const readline = require("readline");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const https = require("https");

// ── Config ────────────────────────────────────────────────────────────────
const DEFAULT_API_URL = "https://thedevelofurr.online";

/**
 * The backend URL is not something we ask users for — the plugin ships knowing
 * where its own service lives. `AIPM_API_URL` exists only for developing
 * against a local backend and for self-hosters; set it in the environment that
 * launches Claude Code.
 */
function resolveApiUrl() {
  const override = (process.env.AIPM_API_URL || process.env.API_URL || "").trim();
  if (override && !override.includes("${")) {
    return { url: override, source: "AIPM_API_URL env override" };
  }
  return { url: DEFAULT_API_URL, source: "default" };
}

const { url: RESOLVED_API_URL, source: API_URL_SOURCE } = resolveApiUrl();
const API_URL = RESOLVED_API_URL.replace(/\/$/, "");
const API_TOKEN = process.env.API_TOKEN || "";
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
const CONFIG_FILE = path.join(PROJECT_DIR, ".ai-project-manager.json");
const LOG_FILE =
  process.env.AIPM_LOG_FILE || path.join(os.tmpdir(), "ai-project-manager-plugin.log");
const LOG_MAX_BYTES = 2 * 1024 * 1024;

// ── JSON-RPC helpers ──────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin });
let buffer = "";

/**
 * Anything that might carry the API token gets scrubbed before it is written.
 * The prefix stays — the backend indexes tokens by it, so it's what makes a
 * log useful for telling two tokens apart.
 */
function redact(text) {
  return String(text).replace(/ppt_[a-f0-9]{4,}/gi, (m) => `${m.slice(0, 14)}…[redacted]`);
}

function tokenSummary() {
  if (!API_TOKEN) {
    return { present: false, reason: "No API token is configured (API_TOKEN is empty) — set it via /plugin" };
  }
  if (API_TOKEN.includes("${")) {
    return {
      present: false,
      reason: `API_TOKEN was not substituted (got the literal "${API_TOKEN}") — the plugin's user config is not set`,
    };
  }
  return {
    present: true,
    prefix: API_TOKEN.slice(0, 14),
    length: API_TOKEN.length,
    format_ok: API_TOKEN.startsWith("ppt_"),
    looks_truncated: API_TOKEN.length < 40,
  };
}

function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    }
  } catch { /* logging must never break the bridge */ }
}

/** Writes to stderr (Claude Code's MCP log) and to a file the user can read. */
function logStderr(msg) {
  const line = redact(msg);
  process.stderr.write(`[ai-pm] ${line}\n`);
  try {
    rotateLogIfNeeded();
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [pid ${process.pid}] ${line}\n`);
  } catch { /* logging must never break the bridge */ }
}

function send(response) {
  const json = JSON.stringify(response);
  process.stdout.write(json + "\n");
  logStderr("→ " + json.slice(0, 200));
}

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch { return null; }
}

function writeConfig(projectId) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ projectId, createdAt: new Date().toISOString() }, null, 2) + "\n");
  logStderr(`Wrote config: ${CONFIG_FILE}`);
}

function deleteConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return false;
  fs.unlinkSync(CONFIG_FILE);
  logStderr(`Removed config: ${CONFIG_FILE}`);
  return true;
}

// ── SSE Proxy client ──────────────────────────────────────────────────────
let sseSessionUrl = null;
let sseRequest = null;
let sseConnecting = null;
let ssePendingRequests = new Map();
let sseRequestCounter = 0;

/**
 * Drop every trace of the current backend session. The next call reconnects
 * from scratch — used both by `reset_connection` and by the automatic retry
 * when the backend has forgotten our session (it keeps them in memory, so a
 * backend restart invalidates them).
 */
function resetSession(reason) {
  logStderr(`Resetting SSE session: ${reason}`);
  for (const [, settle] of ssePendingRequests) {
    settle({ error: { code: -32603, message: `Connection reset: ${reason}` } });
  }
  ssePendingRequests.clear();
  if (sseRequest) {
    try { sseRequest.destroy(); } catch { /* already gone */ }
  }
  sseRequest = null;
  sseSessionUrl = null;
  sseConnecting = null;
}

/** Connect if needed, and never open two sessions for concurrent callers. */
async function ensureSession(projectId) {
  if (sseSessionUrl) return;
  if (!sseConnecting) {
    sseConnecting = connectSSE(projectId).finally(() => { sseConnecting = null; });
  }
  await sseConnecting;
}

function httpFetch(url, options) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.request(
      parsed,
      { method: options.method, headers: options.headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
        });
      }
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
    setTimeout(() => { req.destroy(); reject(new Error("timeout")); }, 15000);
  });
}

async function connectSSE(projectId) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${API_URL}/api/projects/${projectId}/mcp/sse`);
    const mod = parsed.protocol === "https:" ? https : http;

    const token = tokenSummary();
    logStderr(
      `Connecting SSE → ${parsed.href} | token ${JSON.stringify(token)}`,
    );

    const req = mod.request(
      parsed,
      {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      },
      (res) => {
        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", (c) => body += c);
          res.on("end", () => {
            logStderr(`SSE connect rejected: HTTP ${res.statusCode} body=${body}`);
            const err = new Error(`SSE connect failed: HTTP ${res.statusCode} ${body}`);
            err.statusCode = res.statusCode;
            err.body = body;
            reject(err);
          });
          return;
        }
        logStderr(`SSE connect accepted: HTTP 200 for project ${projectId}`);

        let buffer = "";
        let eventType = "";
        let dataBuffer = "";

        res.on("data", (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split("\n");
          buffer = lines.pop(); // keep incomplete line

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
            } else if (line.startsWith("data: ")) {
              dataBuffer += line.slice(6);
            } else if (line === "") {
              // Empty line = end of event
              if (eventType === "endpoint") {
                sseSessionUrl = `${API_URL}${dataBuffer.trim()}`;
                logStderr(`SSE session: ${sseSessionUrl}`);
                resolve();
              } else if (eventType === "message") {
                try {
                  const msg = JSON.parse(dataBuffer);
                  const reqId = msg.id;
                  if (reqId && ssePendingRequests.has(reqId)) {
                    ssePendingRequests.get(reqId)(msg);
                    ssePendingRequests.delete(reqId);
                  }
                } catch (e) {
                  logStderr(`SSE parse error: ${e.message}`);
                }
              }
              eventType = "";
              dataBuffer = "";
            }
          }
        });

        res.on("error", reject);
        res.on("close", () => {
          logStderr("SSE connection closed");
          // Don't keep serving a dead session URL — force a reconnect.
          if (sseRequest === req) {
            sseSessionUrl = null;
            sseRequest = null;
          }
        });

        setTimeout(() => {
          if (!sseSessionUrl) reject(new Error("SSE: no endpoint event received"));
        }, 10000);
      }
    );

    req.on("error", reject);
    req.end();
    sseRequest = req;
  });
}

async function sseRpc(method, params) {
  if (!sseSessionUrl) throw new Error("Not connected to backend");

  const id = ++sseRequestCounter;
  const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });

  return new Promise((resolve, reject) => {
    ssePendingRequests.set(id, resolve);

    const parsed = new URL(sseSessionUrl);
    // sessionId is in query params
    const fullBody = body;

    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.request(
      parsed,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(fullBody),
        },
      },
      (res) => {
        res.resume();
        // Response comes through SSE, this is just the 202 ack
        if (res.statusCode !== 202) {
          ssePendingRequests.delete(id);
          const err = new Error(`SSE rpc failed: HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          reject(err);
        }
      }
    );
    req.on("error", (err) => { ssePendingRequests.delete(id); reject(err); });
    req.write(fullBody);
    req.end();

    setTimeout(() => { ssePendingRequests.delete(id); reject(new Error("RPC timeout")); }, 30000);
  });
}

/**
 * Proxy a call, reconnecting once if the backend no longer knows our session.
 * A 404 on the messages endpoint means exactly that — usually a backend
 * restart — and it's recoverable without the user restarting Claude Code.
 */
async function sseRpcWithRetry(projectId, method, params) {
  await ensureSession(projectId);
  try {
    return await sseRpc(method, params);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
    resetSession("backend reported an unknown session (404)");
    await ensureSession(projectId);
    return await sseRpc(method, params);
  }
}

// ── Web app discovery ─────────────────────────────────────────────────────
// The user only configures the API URL, so ask the backend where the web app
// lives — that's the link we hand the user to pick a project ID from.
async function fetchConnectUrl() {
  try {
    const res = await httpFetch(`${API_URL}/api/config`, { method: "GET", headers: {} });
    if (res.status !== 200) return null;
    const parsed = JSON.parse(res.body.toString());
    return parsed.connectUrl || (parsed.frontendUrl ? `${parsed.frontendUrl}/connect` : null);
  } catch (err) {
    logStderr(`Could not fetch /api/config: ${err.message}`);
    return null;
  }
}

/**
 * Ask the backend which project this token belongs to. A project-scoped 401
 * can't distinguish "revoked", "mistyped", and "right token, wrong project" —
 * this can.
 */
async function fetchWhoami() {
  if (!API_TOKEN) return { checked: false, reason: tokenSummary().reason };
  try {
    const res = await httpFetch(`${API_URL}/api/mcp/whoami`, {
      method: "GET",
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    const body = res.body.toString();
    logStderr(`whoami → HTTP ${res.status} ${body}`);
    if (res.status === 200) return { checked: true, ...JSON.parse(body) };
    let message = body;
    try { message = JSON.parse(body).message ?? body; } catch { /* keep raw */ }
    return { checked: true, valid: false, status: res.status, message };
  } catch (err) {
    logStderr(`whoami failed: ${err.message}`);
    return { checked: false, reason: `Could not reach ${API_URL}/api/mcp/whoami: ${err.message}` };
  }
}

function readLogTail(lines) {
  try {
    if (!fs.existsSync(LOG_FILE)) return { path: LOG_FILE, exists: false, lines: [] };
    const all = fs.readFileSync(LOG_FILE, "utf-8").split("\n").filter(Boolean);
    return { path: LOG_FILE, exists: true, total_lines: all.length, lines: all.slice(-lines) };
  } catch (err) {
    return { path: LOG_FILE, exists: false, error: err.message, lines: [] };
  }
}

// ── Diagnostics ───────────────────────────────────────────────────────────
async function checkApiConnectivity(projectId) {
  if (!projectId) {
    // No project linked yet: no scoped endpoint to authenticate against,
    // so just confirm the backend itself is up.
    try {
      await httpFetch(`${API_URL}/`, { method: "GET", headers: {} });
      return { reachable: true, auth_valid: null, error: null };
    } catch (err) {
      return { reachable: false, auth_valid: null, error: err.message };
    }
  }

  try {
    await ensureSession(projectId);
    return { reachable: true, auth_valid: true, error: null };
  } catch (err) {
    return { reachable: false, auth_valid: false, error: err.message };
  }
}

// ── MCP message handler ───────────────────────────────────────────────────
async function handleMessage(msg) {
  const { method, id, params } = msg;

  switch (method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "ai-project-manager", version: "0.7.0" },
          instructions:
            "This plugin connects to the AI Project Manager backend via MCP/SSE. " +
            "If no project is linked, use `setup_project` first. " +
            "Run `diagnostics` to check connectivity, and `reset_connection` to recover from " +
            "session or connection errors (with unlink: true to link a different project).",
        },
      };

    case "notifications/initialized":
      return null;

    case "tools/list": {
      const config = readConfig();

      // Local tools stay listed whether or not a project is linked — they are
      // the only way to diagnose or recover a broken connection.
      const localTools = [
        {
          name: "diagnostics",
          description: `Health report for the plugin. Config file: ${CONFIG_FILE}`,
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "read_log",
          description: `Read the tail of the plugin's own log (${LOG_FILE}) — every request, connection attempt, and HTTP status, with API tokens redacted. Use this to trace what actually happened when setup or a tool call failed.`,
          inputSchema: {
            type: "object",
            properties: {
              lines: { type: "number", description: "How many trailing lines to return. Default 80." },
            },
          },
        },
        {
          name: "reset_connection",
          description:
            "Reset the connection to the AI Project Manager backend: drops the current session and reconnects. " +
            "Use when tool calls fail with session/connection errors. " +
            "Pass unlink: true to also forget which project this directory is linked to, so setup_project can link a different one.",
          inputSchema: {
            type: "object",
            properties: {
              unlink: {
                type: "boolean",
                description: `Also delete ${CONFIG_FILE}, unlinking this directory from its project. Default false.`,
              },
            },
          },
        },
      ];

      if (!config?.projectId) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              ...localTools,
              {
                name: "setup_project",
                description: `Link this directory to a project. Config written to ${CONFIG_FILE}. Get the project ID from the connect page reported by diagnostics (connect_url) — it lists the user's projects with a copy button per ID.`,
                inputSchema: {
                  type: "object",
                  properties: {
                    projectId: { type: "string", description: "Project UUID the user copied from the connect page (also visible in the web app URL: /projects/<ID>)" },
                  },
                  required: ["projectId"],
                },
              },
            ],
          },
        };
      }

      // Connected: proxy tools/list to backend, alongside the local tools
      try {
        const result = await sseRpcWithRetry(config.projectId, "tools/list", {});
        const remoteTools = result.result?.tools ?? [];
        return { jsonrpc: "2.0", id, result: { tools: [...remoteTools, ...localTools] } };
      } catch (err) {
        logStderr(`Proxy tools/list failed: ${err.message}`);
        // Still advertise the local tools so the user can diagnose and reset.
        return { jsonrpc: "2.0", id, result: { tools: localTools } };
      }
    }

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};

      // Local tools (always handled locally)
      if (toolName === "read_log") {
        const lines = typeof toolArgs.lines === "number" ? toolArgs.lines : 80;
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(readLogTail(lines), null, 2) }],
          },
        };
      }

      if (toolName === "diagnostics") {
        const config = readConfig();
        const connectivity = await checkApiConnectivity(config?.projectId);
        const connectUrl = config?.projectId ? null : await fetchConnectUrl();
        const token = tokenSummary();
        const whoami = await fetchWhoami();

        // Name the one thing blocking setup, in the order the user hits them:
        // no token at all, then a token that isn't for this project.
        let problem = null;
        if (!token.present) {
          problem =
            `${token.reason}. Create one in the web app (Project → Settings → MCP → Create Token), ` +
            "then run /plugin, select AI Project Manager, and paste it there — not into the chat. " +
            "Restart Claude Code afterwards.";
        } else if (whoami.valid && config?.projectId && whoami.projectId !== config.projectId) {
          problem = `Token belongs to project "${whoami.projectName}" (${whoami.projectId}), but this directory is linked to ${config.projectId}. Link that project instead, or create a token for this one.`;
        }
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  plugin_version: "0.7.0",
                  api_url: API_URL,
                  api_url_source: API_URL_SOURCE,
                  api_reachable: connectivity.reachable,
                  api_auth_valid: connectivity.auth_valid,
                  api_error: connectivity.error,
                  sse_connected: sseSessionUrl !== null,
                  log_file: LOG_FILE,
                  token,
                  token_owner: whoami,
                  problem,
                  config_file: {
                    path: CONFIG_FILE,
                    exists: config !== null,
                    valid: !!(config?.projectId),
                  },
                  project: config?.projectId
                    ? { id: config.projectId, linked_at: config.createdAt }
                    : {
                        hint: "Ask the user to open connect_url, copy a project ID, and paste it back. Then call setup_project with it.",
                        connect_url: connectUrl,
                        connect_url_error: connectUrl
                          ? null
                          : `Could not reach ${API_URL}/api/config — the backend may be down or too old to expose the web app URL.`,
                      },
                }, null, 2),
              },
            ],
          },
        };
      }

      if (toolName === "reset_connection") {
        const unlink = toolArgs.unlink === true;
        resetSession(unlink ? "reset_connection (unlink)" : "reset_connection");

        let unlinked = false;
        if (unlink) {
          try {
            unlinked = deleteConfig();
          } catch (err) {
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: JSON.stringify({ error: `Could not remove ${CONFIG_FILE}: ${err.message}` }, null, 2) }],
                isError: true,
              },
            };
          }
        }

        const config = readConfig();
        let reconnected = false;
        let reconnectError = null;

        if (config?.projectId) {
          try {
            await ensureSession(config.projectId);
            await sseRpc("tools/list", {});
            reconnected = true;
          } catch (err) {
            reconnectError = err.message;
            resetSession("reconnect after reset failed");
          }
        }

        send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  session_cleared: true,
                  unlinked: unlink ? unlinked : false,
                  project: config?.projectId ?? null,
                  reconnected,
                  error: reconnectError,
                  next: config?.projectId
                    ? reconnected
                      ? "Connection is healthy again. Retry what failed."
                      : "Reconnect failed — run diagnostics, and check that the backend is running and the API token is valid."
                    : "This directory is no longer linked. Run setup_project with a project ID to link one.",
                }, null, 2),
              },
            ],
          },
        };
      }

      if (toolName === "setup_project") {
        const projectId = toolArgs.projectId;
        // Validate by attempting SSE connection
        try {
          resetSession("switching project");
          await connectSSE(projectId);
          await sseRpc("tools/list", {}); // Verify connectivity
          writeConfig(projectId);
          send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    success: true,
                    message: "Project linked. All tools are now available.",
                    config_file: CONFIG_FILE,
                  }, null, 2),
                },
              ],
            },
          };
        } catch (err) {
          // Work out *why* before answering: a 401 here is nearly always a
          // token issued for a different project, which the error alone can't
          // tell you.
          const token = tokenSummary();
          const whoami = err.statusCode === 401 ? await fetchWhoami() : { checked: false };

          let hint;
          if (!token.present) {
            hint = `No API token is configured: ${token.reason}. Run /plugin, set the token, then retry.`;
          } else if (whoami.valid && whoami.projectId !== projectId) {
            hint = `Your token is valid but belongs to project "${whoami.projectName}" (${whoami.projectId}), not ${projectId}. Either link that project instead, or create a token for this one in the web app (Project → Settings → MCP).`;
          } else if (whoami.checked && whoami.valid === false) {
            hint = `The backend does not recognise this token (${whoami.message ?? "rejected"}). It may have been revoked or only partially copied — create a fresh one under Project → Settings → MCP and paste the whole value.`;
          } else {
            hint = `Check the project ID and that the backend at ${API_URL} is running. Run read_log to see the full exchange.`;
          }

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify({
                error: `Could not link project: ${err.message}`,
                status: err.statusCode ?? null,
                token,
                token_owner: whoami,
                hint,
                log_file: LOG_FILE,
              }, null, 2) }],
              isError: true,
            },
          };
        }
      }

      // Proxy other tools to backend
      try {
        const config = readConfig();
        if (!config?.projectId) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify({ error: "No project linked. Run setup_project first." }) }],
              isError: true,
            },
          };
        }

        const result = await sseRpcWithRetry(config.projectId, "tools/call", {
          name: toolName,
          arguments: toolArgs,
        });

        if (result.error) {
          return { jsonrpc: "2.0", id, error: result.error };
        }
        return { jsonrpc: "2.0", id, result: result.result };
      } catch (err) {
        logStderr(`Proxy tools/call [${toolName}] failed: ${err.message}`);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: err.message,
                  hint: err.message.includes("connect")
                    ? `Cannot reach backend at ${API_URL}. Check your API URL and token in plugin settings.`
                    : "Backend connection error. Run diagnostics for details, then reset_connection to reconnect.",
                }, null, 2),
              },
            ],
            isError: true,
          },
        };
      }
    }

    default:
      return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────
logStderr("Starting ai-project-manager MCP bridge");
logStderr(`Backend: ${API_URL} (${API_URL_SOURCE})`);
logStderr(`Config: ${CONFIG_FILE}`);

rl.on("line", (line) => {
  buffer += line;
  try {
    const msg = JSON.parse(buffer);
    buffer = "";
    logStderr("← " + JSON.stringify(msg).slice(0, 200));
    handleMessage(msg).then((response) => {
      if (response !== null) send(response);
    });
  } catch {
    // incomplete JSON, wait for more
  }
});

rl.on("close", () => { logStderr("stdin closed"); process.exit(0); });
process.on("SIGTERM", () => { logStderr("SIGTERM"); process.exit(0); });
