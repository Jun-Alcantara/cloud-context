const readline = require("readline");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");

// ── Config ────────────────────────────────────────────────────────────────
const API_URL = (process.env.API_URL || "http://localhost:3001").replace(/\/$/, "");
const API_TOKEN = process.env.API_TOKEN || "";
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
const CONFIG_FILE = path.join(PROJECT_DIR, ".ai-project-manager.json");

// ── JSON-RPC helpers ──────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin });
let buffer = "";

function logStderr(msg) {
  process.stderr.write(`[ai-pm] ${msg}\n`);
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

// ── SSE Proxy client ──────────────────────────────────────────────────────
let sseSessionUrl = null;
let ssePendingRequests = new Map();
let sseRequestCounter = 0;

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

    const req = mod.request(
      parsed,
      {
        headers: { Authorization: `Bearer ${API_TOKEN}` },
      },
      (res) => {
        if (res.statusCode !== 200) {
          let body = "";
          res.on("data", (c) => body += c);
          res.on("end", () => reject(new Error(`SSE connect failed: HTTP ${res.statusCode} ${body}`)));
          return;
        }

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
        res.on("close", () => logStderr("SSE connection closed"));

        setTimeout(() => {
          if (!sseSessionUrl) reject(new Error("SSE: no endpoint event received"));
        }, 10000);
      }
    );

    req.on("error", reject);
    req.end();
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
          reject(new Error(`SSE rpc failed: HTTP ${res.statusCode}`));
        }
      }
    );
    req.on("error", (err) => { ssePendingRequests.delete(id); reject(err); });
    req.write(fullBody);
    req.end();

    setTimeout(() => { ssePendingRequests.delete(id); reject(new Error("RPC timeout")); }, 30000);
  });
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
    if (!sseSessionUrl) await connectSSE(projectId);
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
          serverInfo: { name: "ai-project-manager", version: "0.2.0" },
          instructions:
            "This plugin connects to the AI Project Manager backend via MCP/SSE. " +
            "If no project is linked, use `setup_project` first. " +
            "Run `diagnostics` to check connectivity.",
        },
      };

    case "notifications/initialized":
      return null;

    case "tools/list": {
      const config = readConfig();
      if (!config?.projectId) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "diagnostics",
                description: `Health report for the plugin. Config file: ${CONFIG_FILE}`,
                inputSchema: { type: "object", properties: {} },
              },
              {
                name: "setup_project",
                description: `Link this directory to a project. Config written to ${CONFIG_FILE}.`,
                inputSchema: {
                  type: "object",
                  properties: {
                    projectId: { type: "string", description: "UUID from web app URL: /projects/<ID>" },
                  },
                  required: ["projectId"],
                },
              },
            ],
          },
        };
      }

      // Connected: proxy tools/list to backend
      try {
        if (!sseSessionUrl) await connectSSE(config.projectId);
        const result = await sseRpc("tools/list", {});
        return { jsonrpc: "2.0", id, result: result.result };
      } catch (err) {
        logStderr(`Proxy tools/list failed: ${err.message}`);
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: `Backend unavailable: ${err.message}` },
        };
      }
    }

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};

      // Local tools (always handled locally)
      if (toolName === "diagnostics") {
        const config = readConfig();
        const connectivity = await checkApiConnectivity(config?.projectId);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  plugin_version: "0.2.0",
                  api_url: API_URL,
                  api_reachable: connectivity.reachable,
                  api_auth_valid: connectivity.auth_valid,
                  sse_connected: sseSessionUrl !== null,
                  config_file: {
                    path: CONFIG_FILE,
                    exists: config !== null,
                    valid: !!(config?.projectId),
                  },
                  project: config?.projectId
                    ? { id: config.projectId, linked_at: config.createdAt }
                    : { hint: "Run setup_project with a project ID from the web app." },
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
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify({ error: `Invalid project ID or connection failed: ${err.message}`, hint: "Check the project ID in the web app URL, and verify your API token and URL in plugin settings." }, null, 2) }],
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

        if (!sseSessionUrl) await connectSSE(config.projectId);
        const result = await sseRpc("tools/call", { name: toolName, arguments: toolArgs });

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
                    : "Backend connection error. Run diagnostics for details.",
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
logStderr(`Backend: ${API_URL}`);
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
