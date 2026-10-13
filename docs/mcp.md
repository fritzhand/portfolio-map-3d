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

`node mcp/server.mjs --list` prints the tools and prompts without starting the server.

## The builder's tools

| Tool | What it does |
|---|---|
| `get_status` | The map's settings and counts, what the companies lack (descriptions, logos, websites, services), the validator's problems, and next steps. |
| `get_taxonomy` | The districts and the vocabularies records use: services, industries served, connection kinds, business models, district icons. |
| `list_companies`, `get_company` | The companies, briefly or one in full with its sources. |
| `create_site` | Replaces the fictional example with a blank map for an organization (`npm run new-site`), with the walk world it chooses. |
| `update_site` | Changes `site/site.json`: names, addresses, labels, theme colors, and the walk world (`walk`): which world, campus or classic ([configuration.md](./configuration.md#the-walk-world)), and the classic world's optional parts, which the campus ignores ([walk-world.md](./walk-world.md#turning-parts-on-and-off)). |
| `set_districts` | Replaces the districts in `site/taxonomy.json`. |
| `upsert_company` | Adds a company, or updates one by slug. |
| `remove_company` | Removes a company, its logo and the connections to it. |
| `import_companies_csv` | Companies from a spreadsheet export ([importing.md](./importing.md)), merged by slug; `dryRun` previews the import. |
| `import_companies` | Companies an assistant read from another app the user has connected (a CRM, a database, a spreadsheet), with only the fields the map shows; `dryRun` previews the import ([below](#from-another-app-a-crm-a-database-a-spreadsheet)). |
| `add_logo` | Saves a company's logo from a public https address or a local file. |
| `build_site` | `npm run build`. |
| `check_live_map` | The joining handshake against the deployed map (`npm run join-check`). |
| `draft_registry_entry` | The registry file to add by pull request ([network.md](./network.md#joining)). |

And one prompt, a step-by-step guide an assistant starts from (in Claude Code, a slash command):

| Prompt | What it does |
|---|---|
| `import_from_app` | Brings companies from another app the user has connected into the map, through `import_companies`: one list the organization publishes, only the fields the map shows, and a preview the user confirms ([below](#from-another-app-a-crm-a-database-a-spreadsheet)). Arguments: `app` and `list`, both optional. |

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
- **An import can be previewed.** `import_companies` and `import_companies_csv` take
  `dryRun: true`: the same checks, nothing written, and a list of what would be created, updated
  (with the fields that change) and removed, with a few records as they would be written.

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

## From another app: a CRM, a database, a spreadsheet

An organization's companies often live in another app: a CRM such as HubSpot, a database such
as Airtable or Notion, a Google Sheet. An assistant connected both to that app (its connector or
MCP server) and to the builder can bring them in. The builder never connects to the other app and
never sees its keys: the assistant reads the records with its own connection and hands the
builder only the fields the map shows.

Start from the prompt (in Claude Code: `/mcp__portfolio-map__import_from_app HubSpot "Show on
map"`), or ask: "Import our companies from HubSpot, the Show on map list." The prompt walks the
assistant through five steps:

1. **Choose what to publish.** The map is public, so the import takes one list, view or filter,
   never every record. Best is a field the organization sets on purpose, such as a "Show on map"
   checkbox.
2. **Read only what the map shows.** `name`, `district`, `website`, `description` (the company's
   own public words, verbatim, never internal notes), `location` (city and state or country),
   `linkedin`, `founders` (only people the record names founders, "Name (Title)"), `tags` and
   `keywords`. The assistant shows the field mapping before it reads the records.
3. **Name the source.** One source for the whole import:
   `{ "kind": "org-records", "title": "HubSpot: Show on map, read for Acme Ventures on 2026-10-13" }`,
   or the page where the same list is published.
4. **Preview.** `import_companies` with `dryRun: true` checks everything and writes nothing. The
   assistant shows the user what would be created, updated and refused, and a few records exactly
   as they would be published.
5. **Write**, only after the user confirms: the same call without `dryRun`. Up to 500 rows a call.

What keeps it safe:

- **Only the map's fields get in.** A row with any other field (an email address, an owner, a deal
  amount, a note) is refused before the tool runs, so the assistant cannot pass more than the map
  shows even by mistake.
- **The same checks as every write.** An email address or phone number in any field, an unknown
  district, service or industry, or a repeated slug stops the import with nothing written, and the
  result is checked with the validator the build runs.
- **Nothing changes in the other app.** The builder has no way to write to it, and the prompt and
  the server's instructions tell the assistant never to.
- **The other app's text is data.** Records can hold anything; the server's instructions tell the
  assistant to treat what it reads as data, never as instructions.

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
