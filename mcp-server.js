const readline = require("readline");
const path = require("path");
const fs = require("fs");

// ── Config ────────────────────────────────────────────────────────────────
const API_URL = (process.env.API_URL || "http://localhost:3001").replace(
  /\/$/,
  ""
);
const API_TOKEN = process.env.API_TOKEN || "";
const PROJECT_DIR = process.env.PROJECT_DIR || process.cwd();
const CONFIG_FILE = path.join(PROJECT_DIR, ".ai-project-manager.json");

// ── JSON-RPC helpers ──────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin });
let buffer = "";

function logStderr(msg) {
  process.stderr.write(`[ai-project-manager] ${msg}\n`);
}

function send(response) {
  const json = JSON.stringify(response);
  process.stdout.write(json + "\n");
  logStderr("→ " + json.slice(0, 200));
}

function readConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    logStderr(`Failed to read config: ${err.message}`);
    return null;
  }
}

function writeConfig(projectId) {
  const data = { projectId, createdAt: new Date().toISOString() };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2) + "\n");
  logStderr(`Wrote config: ${CONFIG_FILE}`);
  return data;
}

// ── API client ────────────────────────────────────────────────────────────
async function apiRequest(method, endpoint, body) {
  const url = `${API_URL}${endpoint}`;
  logStderr(`API ${method} ${url}`);

  try {
    const options = {
      method,
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    };
    if (body !== undefined) options.body = JSON.stringify(body);

    const res = await fetch(url, options);

    if (res.status === 204) return null;

    const contentType = res.headers.get("content-type") || "";
    const body = contentType.includes("application/json")
      ? await res.json()
      : await res.text();

    if (!res.ok) {
      const msg =
        typeof body === "object" && body.message
          ? body.message
          : `HTTP ${res.status}`;
      throw new Error(msg);
    }

    return body;
  } catch (err) {
    if (err.name === "TimeoutError")
      throw new Error(`Backend unreachable: ${API_URL}`);
    throw err;
  }
}

async function checkApiConnectivity() {
  try {
    const user = await apiRequest("GET", "/api/projects");
    return { reachable: true, auth_valid: Array.isArray(user), error: null };
  } catch (err) {
    return { reachable: false, auth_valid: false, error: err.message };
  }
}

async function validateProject(projectId) {
  const project = await apiRequest("GET", `/api/projects/${projectId}`);
  return project;
}

// ── Tool definitions ──────────────────────────────────────────────────────
function getTools() {
  const config = readConfig();
  const hasProject = config && config.projectId;
  const configPath = CONFIG_FILE;

  const always = [
    {
      name: "diagnostics",
      description: `Get a health report for the ai-project-manager plugin. Reports connectivity to the backend, whether this directory is linked to a project, and the config file path (${configPath}). Use this to troubleshoot any issues.`,
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
  ];

  const unconfigured = hasProject
    ? []
    : [
        {
          name: "setup_project",
          description: `Link this directory to a project in the AI Project Manager web app. After calling this, all project management tools become available. You need the project's ID — find it in the web app under the project's URL (/projects/<ID>). The config file is written to ${configPath}.`,
          inputSchema: {
            type: "object",
            properties: {
              projectId: {
                type: "string",
                description:
                  "The UUID of the project from the AI Project Manager web app",
              },
            },
            required: ["projectId"],
          },
        },
      ];

  const configured = hasProject
    ? [
        {
          name: "get_project_info",
          description:
            "Get information about the linked project including its name, description, and kanban board count.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "kanban",
          description: `Manage kanban boards for the linked project. Actions:

Boards: list_boards, get_board, create_board (requires name), update_board (requires boardId), delete_board (requires boardId)
Columns: create_column (requires boardId, name), update_column (requires boardId, columnId, name), delete_column (requires boardId, columnId)
Tasks: create_task (requires boardId, columnId, title), update_task (requires boardId, taskId), move_task (requires boardId, taskId, columnId, position), delete_task (requires boardId, taskId), get_task (requires boardId, taskId)
Comments: create_comment (requires boardId, taskId, content), list_comments (requires boardId, taskId), delete_comment (requires boardId, taskId, commentId)`,
          inputSchema: {
            type: "object",
            properties: {
              action: {
                type: "string",
                description: "The action to perform",
                enum: [
                  "list_boards",
                  "get_board",
                  "create_board",
                  "update_board",
                  "delete_board",
                  "create_column",
                  "update_column",
                  "delete_column",
                  "create_task",
                  "update_task",
                  "move_task",
                  "delete_task",
                  "get_task",
                  "create_comment",
                  "list_comments",
                  "delete_comment",
                ],
              },
              boardId: { type: "string", description: "Board ID" },
              columnId: { type: "string", description: "Column ID" },
              taskId: { type: "string", description: "Task ID" },
              commentId: { type: "string", description: "Comment ID" },
              name: {
                type: "string",
                description: "Name (for board or column)",
              },
              title: { type: "string", description: "Task title" },
              description: {
                type: "string",
                description: "Description in markdown",
              },
              content: {
                type: "string",
                description: "Comment content in markdown",
              },
              position: { type: "number", description: "Position for ordering" },
            },
            required: ["action"],
          },
        },
      ]
    : [];

  return [...always, ...unconfigured, ...configured];
}

// ── Tool handlers ─────────────────────────────────────────────────────────
async function handleToolCall(name, args) {
  switch (name) {
    case "diagnostics": {
      const config = readConfig();
      const connectivity = await checkApiConnectivity();
      return {
        plugin_version: "0.1.0",
        api_url: API_URL,
        api_reachable: connectivity.reachable,
        api_auth_valid: connectivity.auth_valid,
        api_error: connectivity.error,
        config_file: {
          path: CONFIG_FILE,
          exists: config !== null,
          valid: config && config.projectId ? true : false,
        },
        project: config?.projectId
          ? { id: config.projectId, linked_at: config.createdAt }
          : {
              hint: 'Call setup_project with the project ID from the web app. Find it at your-ai-pm-instance/projects/<ID>.',
            },
      };
    }

    case "setup_project": {
      // Validate the project exists in the backend
      const project = await validateProject(args.projectId);
      const config = writeConfig(args.projectId);
      // Notify client to re-fetch tool list
      send({ jsonrpc: "2.0", method: "notifications/tools/list_changed" });
      return {
        success: true,
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
        },
        config_file: CONFIG_FILE,
        message:
          "This directory is now linked. All project management tools are available.",
      };
    }

    case "get_project_info": {
      const config = readConfig();
      if (!config?.projectId)
        return { error: "No project linked. Run setup_project first." };
      const project = await validateProject(config.projectId);
      const boards = await apiRequest(
        "GET",
        `/api/projects/${config.projectId}/kanban/boards`
      );
      return {
        id: project.id,
        name: project.name,
        description: project.description,
        boards_count: Array.isArray(boards) ? boards.length : 0,
      };
    }

    case "kanban": {
      const config = readConfig();
      if (!config?.projectId)
        return { error: "No project linked. Run setup_project first." };

      const { projectId } = config;
      const { action, boardId, columnId, taskId, commentId, name, title, description, content, position } = args;
      const base = `/api/projects/${projectId}/kanban`;

      switch (action) {
        // Boards
        case "list_boards":
          return { boards: (await apiRequest("GET", `${base}/boards`) || []).map((b) => ({ id: b.id, name: b.name, description: b.description })) };
        case "get_board":
          if (!boardId) return { error: "boardId is required" };
          return await apiRequest("GET", `${base}/boards/${boardId}`);
        case "create_board":
          if (!name) return { error: "name is required" };
          return await apiRequest("POST", `${base}/boards`, { name, description });
        case "update_board":
          if (!boardId) return { error: "boardId is required" };
          return await apiRequest("PATCH", `${base}/boards/${boardId}`, { name, description });
        case "delete_board":
          if (!boardId) return { error: "boardId is required" };
          await apiRequest("DELETE", `${base}/boards/${boardId}`);
          return { success: true, message: "Board deleted" };

        // Columns
        case "create_column":
          if (!boardId || !name) return { error: "boardId and name are required" };
          return await apiRequest("POST", `${base}/boards/${boardId}/columns`, { name, position });
        case "update_column":
          if (!boardId || !columnId) return { error: "boardId and columnId are required" };
          return await apiRequest("PATCH", `${base}/boards/${boardId}/columns/${columnId}`, { name, position });
        case "delete_column":
          if (!boardId || !columnId) return { error: "boardId and columnId are required" };
          await apiRequest("DELETE", `${base}/boards/${boardId}/columns/${columnId}`);
          return { success: true, message: "Column deleted" };

        // Tasks
        case "create_task":
          if (!boardId || !columnId || !title) return { error: "boardId, columnId, and title are required" };
          return await apiRequest("POST", `${base}/boards/${boardId}/tasks`, { columnId, title, description, position });
        case "update_task":
          if (!boardId || !taskId) return { error: "boardId and taskId are required" };
          return await apiRequest("PATCH", `${base}/boards/${boardId}/tasks/${taskId}`, { title, description });
        case "move_task":
          if (!boardId || !taskId || !columnId || position === undefined)
            return { error: "boardId, taskId, columnId, and position are required" };
          return await apiRequest("PATCH", `${base}/boards/${boardId}/tasks/${taskId}/move`, { columnId, position });
        case "delete_task":
          if (!boardId || !taskId) return { error: "boardId and taskId are required" };
          await apiRequest("DELETE", `${base}/boards/${boardId}/tasks/${taskId}`);
          return { success: true, message: "Task deleted" };
        case "get_task":
          if (!boardId || !taskId) return { error: "boardId and taskId are required" };
          return await apiRequest("GET", `${base}/boards/${boardId}/tasks/${taskId}`);

        // Comments
        case "create_comment":
          if (!boardId || !taskId || !content) return { error: "boardId, taskId, and content are required" };
          return await apiRequest("POST", `${base}/boards/${boardId}/tasks/${taskId}/comments`, { content });
        case "list_comments":
          if (!boardId || !taskId) return { error: "boardId and taskId are required" };
          return await apiRequest("GET", `${base}/boards/${boardId}/tasks/${taskId}/comments`);
        case "delete_comment":
          if (!boardId || !taskId || !commentId) return { error: "boardId, taskId, and commentId are required" };
          await apiRequest("DELETE", `${base}/boards/${boardId}/tasks/${taskId}/comments/${commentId}`);
          return { success: true, message: "Comment deleted" };

        default:
          return { error: `Unknown kanban action: ${action}. Supported: ${"list_boards, get_board, create_board, update_board, delete_board, create_column, update_column, delete_column, create_task, update_task, move_task, delete_task, get_task, create_comment, list_comments, delete_comment"}` };
      }
    }

    default:
      return { error: `Unknown tool: ${name}` };
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
          serverInfo: {
            name: "ai-project-manager",
            version: "0.1.0",
          },
          instructions:
            "This plugin connects Claude Code to the AI Project Manager web app. " +
            "Use the `diagnostics` tool to check connectivity. " +
            "If no project is linked, use `setup_project` with a project ID from the web app.",
        },
      };

    case "notifications/initialized":
      return null; // no response needed for notifications

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: getTools() },
      };

    case "tools/call": {
      const toolName = params?.name;
      const toolArgs = params?.arguments ?? {};

      if (!toolName) {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: "Missing tool name" },
        };
      }

      try {
        const result = await handleToolCall(toolName, toolArgs);

        if (result?.error) {
          return {
            jsonrpc: "2.0",
            id,
            result: {
              content: [{ type: "text", text: JSON.stringify(result) }],
              isError: true,
            },
          };
        }

        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          },
        };
      } catch (err) {
        logStderr(`Tool error [${toolName}]: ${err.message}`);
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    error: err.message,
                    tool: toolName,
                    hint:
                      err.message.includes("unreachable")
                        ? `Check that your AI Project Manager backend is running at ${API_URL}`
                        : err.message.includes("401")
                          ? "Your API token may be expired. Generate a new one in the web app (Project → Settings → MCP) and re-enable the plugin."
                          : null,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: true,
          },
        };
      }
    }

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      };
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────
logStderr("Starting ai-project-manager MCP server");
logStderr(`API: ${API_URL}`);
logStderr(`Project dir: ${PROJECT_DIR}`);
logStderr(`Config file: ${CONFIG_FILE}`);

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
    // Incomplete JSON, wait for more lines
  }
});

rl.on("close", () => {
  logStderr("stdin closed, shutting down");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logStderr("SIGTERM received, shutting down");
  process.exit(0);
});
