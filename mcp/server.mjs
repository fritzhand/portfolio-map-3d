#!/usr/bin/env node
/* ============================================================
   server.mjs — the local MCP server: lets an AI assistant (Claude
   Code, Claude Desktop, Cursor, any MCP client) build a map in site/
   with the builder's tools (mcp/tools.mjs) and prompts
   (mcp/prompts.mjs), over stdio (docs/mcp.md).
     node mcp/server.mjs          serve (an MCP client starts it)
     node mcp/server.mjs --list   print the tools and prompts and exit
   It works on the repository it lives in, whatever the working
   directory. stdout carries the protocol; nothing else is written
   to it while serving.
   ============================================================ */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { TOOL_NAME, callTool, mcpAnnotations } from "../federation/agent.ts";
import { ROOT } from "../scripts/manifest.mjs";
import { PROMPTS, getPrompt } from "./prompts.mjs";
import { INSTRUCTIONS, builderTools } from "./tools.mjs";

const failed = (message) => ({ isError: true, content: [{ type: "text", text: message }] });

/** The MCP server for the site under `root`, not yet connected to a transport. */
export function createServer(root = ROOT) {
  const tools = builderTools(root);
  for (const t of tools) if (!TOOL_NAME.test(t.name)) throw new Error(`tool name "${t.name}" is not valid in MCP and WebMCP`);
  const byName = new Map(tools.map((t) => [t.name, t]));
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  // The low-level Server takes JSON Schema as it is; the same schemas serve WebMCP (federation/agent.ts).
  const server = new Server({ name: "portfolio-map", title: "Portfolio map builder", version }, { capabilities: { tools: {}, prompts: {} }, instructions: INSTRUCTIONS });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: mcpAnnotations(t) })),
  }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const tool = byName.get(request.params.name);
    if (!tool) return failed(`No tool named "${request.params.name}".`);
    try {
      const result = await callTool(tool, request.params.arguments ?? {}, extra.signal);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      // A refusal or a bad input is the assistant's to fix: it goes back as the tool's result.
      return failed(e instanceof Error ? e.message : String(e));
    }
  });
  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map(({ name, title, description, arguments: args }) => ({ name, title, description, arguments: args })),
  }));
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const prompt = getPrompt(request.params.name, request.params.arguments);
    if (!prompt) throw new McpError(ErrorCode.InvalidParams, `No prompt named "${request.params.name}".`);
    return prompt;
  });
  return server;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--list")) {
    for (const t of builderTools(ROOT)) console.log(`${t.name.padEnd(22)} ${t.title}`);
    for (const p of PROMPTS) console.log(`${p.name.padEnd(22)} ${p.title} (a prompt)`);
  } else {
    await createServer().connect(new StdioServerTransport());
    console.error(`portfolio-map MCP server: serving ${ROOT} over stdio`);
  }
}
