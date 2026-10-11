# AI agents: the builder (MCP) and the live sites (WebMCP)

Two ways in for AI agents, built on one set of tool definitions (`federation/agent.ts`):

- **The builder**: a local [MCP](https://modelcontextprotocol.io) server (`mcp/`) that lets an AI
  assistant (Claude Code, Claude Desktop, Cursor, any MCP client) build a map in `site/` through
  tools that keep the [data contract](./data-contract.md).
- **WebMCP**: the deployed map and the Nexus register read-only tools with the browser, so an
  agent in the page can search them without scraping it.

## Set up the builder

Node 22.18 or later, and `npm install` in the repository. Then point your MCP client at
`mcp/server.mjs`; it works on the repository it lives in, whatever the working directory.

- **Claude Code**: the repository's `.mcp.json` names the server; Claude Code asks to enable it
  the first time you open the repository. Or: `claude mcp add portfolio-map -- node /path/to/my-map/mcp/server.mjs`.
- **Claude Desktop**: Settings → Developer → Edit Config, and add the server:

  ```json
  { "mcpServers": { "portfolio-map": { "command": "node", "args": ["/path/to/my-map/mcp/server.mjs"] } } }
  ```

- **Cursor, VS Code and others**: the same command and argument in their MCP settings.

`node mcp/server.mjs --list` prints the tools without starting the server.

## The builder's tools

| Tool | What it does |
|---|---|
| `get_status` | The map's settings and counts, what the companies lack (descriptions, logos, websites, services), the validator's problems, and next steps. |
| `get_taxonomy` | The districts and the vocabularies records use: services, industries served, connection kinds, business models, district icons. |
| `list_companies`, `get_company` | The companies, briefly or one in full with its sources. |
| `create_site` | Replaces the fictional example with a blank map for an organization (`npm run new-site`). |
| `update_site` | Changes `site/site.json`: names, addresses, labels, theme colors, and the walk world's optional parts. |
| `set_districts` | Replaces the districts in `site/taxonomy.json`. |
| `upsert_company` | Adds a company, or updates one by slug. |
| `remove_company` | Removes a company, its logo and the connections to it. |
| `import_companies_csv` | Companies from a spreadsheet export ([importing.md](./importing.md)), merged by slug. |
| `add_logo` | Saves a company's logo from a public https address or a local file. |
| `build_site` | `npm run build`. |
| `check_live_map` | The joining handshake against the deployed map (`npm run join-check`). |
| `draft_registry_entry` | The registry file to add by pull request ([network.md](./network.md#joining)). |

## What the builder guarantees

- **A change that adds a problem is refused, and nothing is written.** Every change is made
  first on a copy of `site/` and checked with `validateSite()`, the same check every build runs
  (`mcp/site.mjs`). The refusal lists the problems; problems the site already had do not block a
  change, so a site can be fixed one record at a time.
- **Every fact keeps its source.** A new company needs at least one source; a new description
  needs its `descriptionSource`; a founder or leader needs a `source`. A source's `retrieved`
  date defaults to the day it is added.
- **No personal contact data.** Email addresses, phone numbers and home addresses are rejected,
  in every field, as the validator rejects them.
- **Nothing is deleted without saying so.** `create_site`, `remove_company` and an import with
  `mode: "replace"` need `confirm: true`; `create_site` replaces a real map (not the example)
  only with `replaceExisting: true`.
- **Logos are checked.** Public https addresses only, 1 MB at most, and the file must be the
  image it claims to be; an SVG with scripts is refused.

What no tool can check, the server's instructions ask of the assistant: never invent, copy a
description verbatim from its source, and name founders only when a source does. Read
`git diff site/` before you commit.

## A session, start to finish

1. "Start a map for Acme Ventures at https://map.acme.vc." (`create_site`)
2. "Our tracks are Fintech, Health and Climate." (`get_taxonomy`, `set_districts`)
3. "Import ~/Downloads/portfolio.csv; the list is published at https://acme.vc/portfolio." (`import_companies_csv`)
4. "Add each company's description from its own website, verbatim, with the page as its source." (`upsert_company`, with the assistant's own web tools)
5. "Add their logos." (`add_logo`)
6. "Build it." (`build_site`), then deploy `dist/` ([deploying.md](./deploying.md)).
7. "Check the live map, and draft our registry entry." (`check_live_map`, `draft_registry_entry`), then open the pull request.

## WebMCP: tools on the live sites

[WebMCP](https://webmachinelearning.github.io/webmcp/) (a W3C Web Machine Learning Community
Group draft) lets a page register tools with the browser at `document.modelContext`; Chrome's
first previews put it at `navigator.modelContext`. In a browser that has either, the sites
register these tools; other visitors never download them.

| Site | Tools |
|---|---|
| A map (`src/agent.ts`) | `search_companies`, `get_company`, `list_districts`, `open_company`; with services on the map, `list_services` and `find_providers` (labeled as suggestions). |
| The Nexus (`nexus/src/agent.ts`) | `list_maps`, `search_network`, `open_map`. |

They read the public data the page already holds (no sources), describe themselves in the
site's own words (`site.json` labels), and never reach the people roster. The ones that return
company texts carry `untrustedContentHint`: those are the companies' own words.

## One definition, two transports

`federation/agent.ts` defines a tool once: a name (lowercase letters, digits and underscores,
valid in both), a title, a description, a JSON Schema for its input, hints and a function.
`callTool()` checks the input against the schema before the function runs, whichever way the
call came. `mcp/server.mjs` serves the builder's tools over stdio; `registerWebMcp()` registers a
page's tools. The hints map to each protocol's annotations:

| Hint | MCP | WebMCP |
|---|---|---|
| `readOnly` | `readOnlyHint` | `readOnlyHint` |
| `destructive` | `destructiveHint` | `consequentialHint` |
| `idempotent` | `idempotentHint` | |
| `openWorld` | `openWorldHint` | |
| `untrustedContent` | | `untrustedContentHint` |
