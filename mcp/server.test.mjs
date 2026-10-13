import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT } from "../scripts/manifest.mjs";
import { createServer } from "./server.mjs";

const SERVER = join(ROOT, "mcp", "server.mjs");
const parse = (result) => JSON.parse(result.content[0].text);

describe("the MCP server", () => {
  let root;
  let client;
  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "builder-server-"));
    cpSync(join(ROOT, "site"), join(root, "site"), { recursive: true });
    mkdirSync(join(root, "src", "components"), { recursive: true });
    copyFileSync(join(ROOT, "src", "components", "bits.tsx"), join(root, "src", "components", "bits.tsx"));
    copyFileSync(join(ROOT, "package.json"), join(root, "package.json"));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(root).connect(serverSide);
    client = new Client({ name: "test", version: "0" });
    await client.connect(clientSide);
  });
  afterAll(async () => {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("introduces itself with the content contract's rules", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "portfolio-map" });
    expect(client.getInstructions()).toMatch(/Never invent/);
    expect(client.getInstructions()).toMatch(/import_companies[\s\S]*dryRun: true[\s\S]*Never change anything in the other app/);
  });

  it("offers the import_from_app prompt, filled in with the app and the list", async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name)).toContain("import_from_app");
    expect(prompts.find((p) => p.name === "import_from_app").arguments.map((a) => a.name)).toEqual(["app", "list"]);
    const { messages } = await client.getPrompt({ name: "import_from_app", arguments: { app: "HubSpot", list: "Show on map" } });
    const text = messages[0].content.text;
    expect(messages[0].role).toBe("user");
    expect(text).toMatch(/from HubSpot/);
    expect(text).toMatch(/"Show on map": confirm that list/);
    expect(text).toMatch(/dryRun: true[\s\S]*Only after I confirm/);
    expect(text).toMatch(/Never read or pass contacts/);
    const plain = (await client.getPrompt({ name: "import_from_app", arguments: {} })).messages[0].content.text;
    expect(plain).toMatch(/Ask me which list, view or filter/);
    await expect(client.getPrompt({ name: "no_such_prompt", arguments: {} })).rejects.toThrow(/No prompt named/);
  });

  it("lists every tool with its JSON Schema and MCP annotations", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain("upsert_company");
    const remove = tools.find((t) => t.name === "remove_company");
    expect(remove.inputSchema.required).toEqual(["slug", "confirm"]);
    expect(remove.annotations).toMatchObject({ destructiveHint: true, readOnlyHint: false });
    expect(tools.find((t) => t.name === "get_status").annotations).toMatchObject({ readOnlyHint: true });
  });

  it("answers a call with JSON text", async () => {
    const status = parse(await client.callTool({ name: "get_status", arguments: {} }));
    expect(status.counts.companies).toBe(29);
  });

  it("writes through the contract, and returns a refusal as the tool's error", async () => {
    const ok = await client.callTool({ name: "upsert_company", arguments: { name: "Northwind Labs", district: "hardware", sources: [{ url: "https://northwind.example", title: "Northwind Labs" }] } });
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse(readFileSync(join(root, "site", "data", "companies.json"), "utf8")).companies.some((c) => c.slug === "northwind-labs")).toBe(true);
    const refused = await client.callTool({ name: "upsert_company", arguments: { name: "Acme", district: "hardware", sources: [{ title: "No url, no kind" }] } });
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toMatch(/nothing was written[\s\S]*needs a url, or a kind/);
    const unknown = await client.callTool({ name: "no_such_tool", arguments: {} });
    expect(unknown.isError).toBe(true);
  });
});

describe("node mcp/server.mjs", () => {
  it("--list prints the tools and prompts", () => {
    const out = execFileSync(process.execPath, [SERVER, "--list"], { encoding: "utf8" });
    expect(out).toMatch(/^get_status\s+Map status$/m);
    expect(out).toMatch(/^import_from_app\s+Build the map from another app \(a prompt\)$/m);
    expect(out.trim().split("\n").length).toBeGreaterThanOrEqual(14);
  });

  it("serves over stdio from any working directory", async () => {
    const client = new Client({ name: "test", version: "0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: tmpdir(), stderr: "pipe" }));
    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThanOrEqual(14);
    expect(parse(await client.callTool({ name: "get_taxonomy", arguments: {} })).icons.length).toBeGreaterThan(5);
    await client.close();
  }, 20000);
});
