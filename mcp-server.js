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

const TOKEN_FILE =
  process.env.AIPM_TOKEN_FILE || path.join(os.homedir(), ".ai-project-manager", "token");

/**
 * Where the API token comes from, highest precedence first:
 *   1. API_TOKEN — the plugin's user config, set through the host's UI.
 *   2. AIPM_API_TOKEN — the environment that launched the host.
 *   3. A token file the user writes themselves.
 *
 * (2) and (3) exist because not every host can take a `sensitive` config value:
 * `/plugin` needs an interactive terminal, and the desktop app has no
 * equivalent dialog. Without a file-based route those users have no way in at
 * all. A literal `${...}` means the host never substituted the config, so treat
 * it as unset rather than sending nonsense as a bearer token.
 */
function resolveToken() {
  const configured = (process.env.API_TOKEN || "").trim();
  if (configured && !configured.includes("${")) {
    return { token: configured, source: "plugin user config" };
  }

  const fromEnv = (process.env.AIPM_API_TOKEN || "").trim();
  if (fromEnv) return { token: fromEnv, source: "AIPM_API_TOKEN env var" };

  try {
    if (fs.existsSync(TOKEN_FILE)) {
      const contents = fs.readFileSync(TOKEN_FILE, "utf-8").trim();
      if (contents) {
        // A credential readable by other accounts is worth flagging, but not
        // worth refusing to start over — the user may be on a single-user box.
        let worldReadable = false;
        try {
          worldReadable = (fs.statSync(TOKEN_FILE).mode & 0o077) !== 0;
        } catch { /* mode is advisory */ }
        return { token: contents, source: `token file (${TOKEN_FILE})`, worldReadable };
      }
    }
  } catch (err) {
    return { token: "", source: "none", fileError: `Could not read ${TOKEN_FILE}: ${err.message}` };
  }

  return {
    token: "",
    source: "none",
    unsubstituted: configured.includes("${") ? configured : null,
  };
}

// Mutable: browser approval can supply a token mid-session, and everything
// downstream should start using it without a restart.
let TOKEN_RESOLUTION = resolveToken();
let API_TOKEN = TOKEN_RESOLUTION.token;
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
const CONFIG_FILE = path.join(PROJECT_DIR, ".ai-project-manager.json");
const LOG_FILE =
  process.env.AIPM_LOG_FILE || path.join(os.tmpdir(), "ai-project-manager-plugin.log");
const LOG_MAX_BYTES = 2 * 1024 * 1024;

/**
 * How long `connect_account` waits before answering. Short enough to stay well
 * inside the host's tool timeout, long enough that a user who clicks straight
 * away is connected by the first call. Calling again resumes the same request.
 */
const DEVICE_WAIT_MS = 60_000;
let pendingDeviceAuth = null;

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
    const why = TOKEN_RESOLUTION.fileError
      ? TOKEN_RESOLUTION.fileError
      : TOKEN_RESOLUTION.unsubstituted
        ? `the plugin's user config was not substituted (got the literal "${TOKEN_RESOLUTION.unsubstituted}")`
        : "no API token is configured";
    return {
      present: false,
      source: "none",
      token_file: TOKEN_FILE,
      reason: `No API token available — ${why}`,
    };
  }
  return {
    present: true,
    source: TOKEN_RESOLUTION.source,
    prefix: API_TOKEN.slice(0, 14),
    length: API_TOKEN.length,
    format_ok: API_TOKEN.startsWith("ppt_"),
    looks_truncated: API_TOKEN.length < 40,
    ...(TOKEN_RESOLUTION.worldReadable
      ? { warning: `${TOKEN_FILE} is readable by other users — chmod 600 it` }
      : {}),
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

/**
 * Only ever read now: the link moved to the server in 0.9.0. This exists to
 * notice a leftover file from an older version and tell the user it's dead.
 */
function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch { return null; }
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
async function ensureSession() {
  if (sseSessionUrl) return;
  if (!sseConnecting) {
    sseConnecting = connectSSE().finally(() => { sseConnecting = null; });
  }
  await sseConnecting;
}

/**
 * The workspace identifies this directory to the backend, which holds the link
 * between it and a project. The git remote is the better key of the two — two
 * checkouts named `api` are ambiguous, their remotes are not — so read it if
 * this is a repository. Parsing `.git/config` directly avoids shelling out to
 * git, which may not be installed, and keeps the bridge dependency-free.
 */
function readGitRemote() {
  try {
    const configPath = path.join(PROJECT_DIR, ".git", "config");
    if (!fs.existsSync(configPath)) return null;
    const config = fs.readFileSync(configPath, "utf-8");
    const section = config.match(/\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/);
    if (!section) return null;
    const url = section[1].match(/^\s*url\s*=\s*(.+)$/m);
    return url ? url[1].trim() : null;
  } catch {
    return null;
  }
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

async function connectSSE() {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams({ workspace: PROJECT_DIR, host: os.hostname() });
    const remote = readGitRemote();
    if (remote) query.set("remote", remote);

    const parsed = new URL(`${API_URL}/api/mcp/sse?${query.toString()}`);
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
        logStderr(`SSE connect accepted: HTTP 200 for workspace ${PROJECT_DIR}`);

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
                  } else if (!reqId && msg.method) {
                    // Server-initiated notification — tools/list_changed when a
                    // link lands. Pass it through so the kanban tools appear
                    // without the user restarting anything.
                    send(msg);
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
async function sseRpcWithRetry(method, params) {
  await ensureSession();
  try {
    return await sseRpc(method, params);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
    resetSession("backend reported an unknown session (404)");
    await ensureSession();
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
async function checkApiConnectivity() {
  // The session is account-scoped, so connecting proves both reachability and
  // a working token without needing to know a project first.
  try {
    await ensureSession();
    return { reachable: true, auth_valid: true, error: null };
  } catch (err) {
    if (err.statusCode === 401) {
      return { reachable: true, auth_valid: false, error: err.message };
    }
    try {
      await httpFetch(`${API_URL}/`, { method: "GET", headers: {} });
      return { reachable: true, auth_valid: null, error: err.message };
    } catch {
      return { reachable: false, auth_valid: null, error: err.message };
    }
  }
}

// ── Browser approval ──────────────────────────────────────────────────────
/**
 * Ask the backend for an approval code, then wait for the user to approve it in
 * a browser where they are already signed in.
 *
 * This exists so a credential never passes through a clipboard, a terminal, or
 * a chat transcript. The token is minted server-side on approval and delivered
 * over this poll — the user never sees it, and neither does the conversation.
 */
async function startDeviceAuth() {
  const res = await httpFetch(`${API_URL}/api/mcp/device/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      hostLabel: os.hostname(),
      workspacePath: PROJECT_DIR,
      clientLabel: "Claude Code plugin",
    }),
  });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`Could not start browser approval: HTTP ${res.status} ${res.body.toString().slice(0, 200)}`);
  }
  return JSON.parse(res.body.toString());
}

async function pollDeviceAuth(deviceCode, { expiresAt, intervalMs }) {
  const deadline = new Date(expiresAt).getTime();
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    let parsed;
    try {
      const res = await httpFetch(`${API_URL}/api/mcp/device/poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceCode }),
      });
      parsed = JSON.parse(res.body.toString());
    } catch (err) {
      // A blip while the user is off in the browser shouldn't end the wait.
      logStderr(`Device poll error (continuing): ${err.message}`);
      continue;
    }
    if (parsed.status !== "pending") return parsed;
  }
  return { status: "expired" };
}

/**
 * Persist the approved token so the next session starts already connected.
 * 0600 from the start — never written world-readable and fixed afterwards.
 */
function writeTokenFile(token) {
  const dir = path.dirname(TOKEN_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(TOKEN_FILE, token, { mode: 0o600 });
  try {
    fs.chmodSync(TOKEN_FILE, 0o600);
  } catch { /* best effort on filesystems without modes */ }
  logStderr(`Wrote token file: ${TOKEN_FILE}`);
}

/** What the backend says this directory is linked to, if anything. */
async function fetchCurrentProject() {
  try {
    const result = await sseRpcWithRetry("tools/call", {
      name: "current_project",
      arguments: {},
    });
    const text = result.result?.content?.[0]?.text;
    return text ? JSON.parse(text) : null;
  } catch (err) {
    logStderr(`current_project failed: ${err.message}`);
    return null;
  }
}

/**
 * Directories linked before 0.9.0 have a local config file that no longer means
 * anything — the link lives on the server now. Report it so the user can delete
 * it, rather than leaving a file that looks like configuration but isn't.
 */
function staleConfigNotice() {
  const config = readConfig();
  if (!config?.projectId) return null;
  return {
    path: CONFIG_FILE,
    project_id: config.projectId,
    note: "Left over from an older version. The link now lives on the server — this file is ignored and can be deleted.",
  };
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
          // `listChanged` must be declared here or the client is entitled to
          // ignore notifications/tools/list_changed — which it does. Without
          // it, a session that starts with no token is stuck with the local
          // tools captured before connecting, and only a restart recovers.
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: "ai-project-manager", version: "0.13.0" },
          instructions:
            "This plugin connects to the AI Project Manager backend via MCP/SSE. " +
            "If no account is connected, call `connect_account` — it returns a URL the user " +
            "approves in their browser, and stores the credential itself. Never ask the user " +
            "to paste a token. " +
            "The link between this directory and a project lives on the server: call " +
            "`current_project` to see it, `list_projects` to see what's available (one may " +
            "be flagged `suggested` — offer it as the default), and `link_project` to bind " +
            "this directory. Never ask the user to paste an API token into the chat. " +
            "Run `diagnostics` to check connectivity, and `reset_connection` to recover " +
            "from session errors.",
        },
      };

    case "notifications/initialized":
      return null;

    case "tools/list": {
      // Local tools stay listed whether or not a project is linked — they are
      // the only way to diagnose or recover a broken connection.
      const localTools = [
        {
          name: "diagnostics",
          description: `Health report for the plugin: token, connectivity, and what this directory (${PROJECT_DIR}) is linked to.`,
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
          name: "connect_account",
          description:
            "Connect this machine to an AI Project Manager account by approving it in the browser. " +
            "Returns a URL for the user to open; they approve there and this stores the resulting " +
            "credential itself. Use this whenever no token is configured — never ask the user to " +
            "paste a token into the conversation. Takes up to 10 minutes while it waits for approval.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "reset_connection",
          description:
            "Reset the connection to the AI Project Manager backend: drops the current session and reconnects. " +
            "Use when tool calls fail with session/connection errors. To change which project this " +
            "directory is linked to, use unlink_project and link_project instead — those act on the " +
            "server-side link and are not affected by this.",
          inputSchema: { type: "object", properties: {} },
        },
      ];

      // The backend decides which project tools exist: the linking tools are
      // always there, the kanban tools appear once the directory resolves.
      try {
        const result = await sseRpcWithRetry("tools/list", {});
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
        const connectivity = await checkApiConnectivity();
        const token = tokenSummary();
        const whoami = await fetchWhoami();
        const current = connectivity.auth_valid ? await fetchCurrentProject() : null;
        const connectUrl = current?.linked ? null : await fetchConnectUrl();

        // Name the one thing blocking setup, in the order the user hits them:
        // no token at all, then a token that isn't for this project.
        let problem = null;
        if (!token.present) {
          problem =
            `${token.reason}. Call connect_account — it returns a URL the user approves in the ` +
            "browser, and stores the credential here automatically. Do not ask the user to paste " +
            "a token into the chat, and do not send them to /plugin unless browser approval fails.";
        } else if (whoami.checked && whoami.valid === false) {
          problem = `The backend rejected this token (${whoami.message ?? "rejected"}). Create a fresh one under Settings → MCP.`;
        } else if (whoami.valid && whoami.scope === "project") {
          problem =
            `This is a project-scoped token, so it can only reach "${whoami.projectName}". ` +
            "An account token (Settings → MCP) reaches every project you belong to.";
        }
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  plugin_version: "0.13.0",
                  api_url: API_URL,
                  api_url_source: API_URL_SOURCE,
                  api_reachable: connectivity.reachable,
                  api_auth_valid: connectivity.auth_valid,
                  api_error: connectivity.error,
                  sse_connected: sseSessionUrl !== null,
                  log_file: LOG_FILE,
                  workspace: { path: PROJECT_DIR, git_remote: readGitRemote() },
                  token,
                  token_owner: whoami,
                  problem,
                  project: current?.linked
                    ? current.project
                    : {
                        linked: false,
                        hint: "Call list_projects, then link_project with the id the user picks. No UUID needs to be copied by hand.",
                        web_app: connectUrl,
                      },
                  stale_local_config: staleConfigNotice(),
                }, null, 2),
              },
            ],
          },
        };
      }

      if (toolName === "connect_account") {
        // Returns after a bounded wait rather than blocking for the full ten
        // minutes: the model gets a URL to show immediately, and calling again
        // resumes the same request instead of invalidating it.
        try {
          if (!pendingDeviceAuth || Date.now() >= new Date(pendingDeviceAuth.expiresAt).getTime()) {
            const started = await startDeviceAuth();
            pendingDeviceAuth = {
              deviceCode: started.deviceCode,
              userCode: started.userCode,
              verificationUrl: started.verificationUrl,
              expiresAt: started.expiresAt,
              intervalMs: (started.pollIntervalSeconds ?? 2) * 1000,
            };
            logStderr(`Device authorization started: ${started.userCode}`);
          }

          const waitUntil = Math.min(
            Date.now() + DEVICE_WAIT_MS,
            new Date(pendingDeviceAuth.expiresAt).getTime(),
          );
          const result = await pollDeviceAuth(pendingDeviceAuth.deviceCode, {
            expiresAt: new Date(waitUntil).toISOString(),
            intervalMs: pendingDeviceAuth.intervalMs,
          });

          if (result.status === "approved") {
            writeTokenFile(result.token);
            API_TOKEN = result.token;
            TOKEN_RESOLUTION = { token: result.token, source: `token file (${TOKEN_FILE})` };
            pendingDeviceAuth = null;
            resetSession("connected a new account");
            send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
            return {
              jsonrpc: "2.0",
              id,
              result: {
                content: [{ type: "text", text: JSON.stringify({
                  connected: true,
                  stored_at: TOKEN_FILE,
                  next: "Connected. Call list_projects and link this directory to one.",
                }, null, 2) }],
              },
            };
          }

          const stillWaiting = result.status === "pending" || result.status === "expired";
          if (result.status === "denied" || result.status === "unknown") {
            pendingDeviceAuth = null;
          }

          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify({
                connected: false,
                status: stillWaiting ? "waiting_for_approval" : result.status,
                approval_url: pendingDeviceAuth?.verificationUrl ?? null,
                code: pendingDeviceAuth?.userCode ?? null,
                next: stillWaiting
                  ? "Give the user the approval_url as a clickable link and ask them to click Approve. Then call connect_account again to finish — it resumes the same request."
                  : result.status === "denied"
                    ? "The request was denied. Call connect_account again to start a new one."
                    : "That request is no longer valid. Call connect_account again.",
              }, null, 2) }],
            },
          };
        } catch (err) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify({
                error: err.message,
                hint: `Could not reach ${API_URL}. Check the backend is up; read_log has the full exchange.`,
              }, null, 2) }],
              isError: true,
            },
          };
        }
      }

      if (toolName === "reset_connection") {
        resetSession("reset_connection");

        let reconnected = false;
        let reconnectError = null;
        let current = null;
        try {
          await ensureSession();
          current = await fetchCurrentProject();
          reconnected = true;
        } catch (err) {
          reconnectError = err.message;
          resetSession("reconnect after reset failed");
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
                  reconnected,
                  error: reconnectError,
                  project: current?.linked ? current.project : null,
                  next: reconnected
                    ? current?.linked
                      ? "Connection is healthy again. Retry what failed."
                      : "Connected, but this directory isn't linked to a project. Call list_projects, then link_project."
                    : "Reconnect failed — run diagnostics, and check that the backend is running and the API token is valid.",
                }, null, 2),
              },
            ],
          },
        };
      }

      // Everything else — including list_projects / link_project — is the
      // backend's. It owns the link, so it decides what this directory reaches.
      try {
        const result = await sseRpcWithRetry("tools/call", {
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
