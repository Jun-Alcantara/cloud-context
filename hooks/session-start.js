#!/usr/bin/env node
// SessionStart hook: context Claude has before the first prompt. Node rather
// than a shell script because the plugin already requires Node, and a bash
// hook would not run on a Windows install.
//
// Keep this short — it is added to every session's context.

const context = [
  'When the user says "AI Joe" (any capitalization, e.g. "ai joe"), they mean',
  "this plugin — thedevelofurr, the AI Project Manager: its MCP tools",
  "(kanban boards and tasks, project documents) and its /thedevelofurr:*",
  "commands. Treat \"ask AI Joe\", \"put it in AI Joe\" and the like as",
  "requests to use those tools.",
].join(" ");

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: context,
    },
  }),
);
