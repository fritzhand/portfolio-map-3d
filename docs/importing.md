# Importing companies from a spreadsheet

```bash
npm run import -- companies.csv --source-title "Acme Ventures: Portfolio" --source-url https://acme.vc/portfolio --retrieved 2026-10-09
npm run import -- companies.csv --org-records "Acme's portfolio records, exported 2026-10-09"
npm run import -- companies.csv --org-records "…" --merge     # update by slug, keep what the CSV leaves empty
npm run validate
```

Export your sheet as CSV (Google Sheets: File → Download → CSV). The import reads these columns by
header name (case, spaces, hyphens and underscores ignored):

| Column | Required | Becomes |
|---|---|---|
| `name` | yes | `name` |
| `district` | yes | `district`: a district's slug, label or short label from `site/taxonomy.json` |
| `slug` | | `slug` (otherwise made from the name: "Café Señor, Inc." → `cafe-senor-inc`) |
| `website` | | `website` (`https://` added when missing) |
| `description` | | `description`, with the import's source as its `descriptionSource` |
| `location` | | `location` |
| `linkedin` | | `linkedin` |
| `tags` | | `tags` (separated by `;`) |
| `founders` | | `founders`: `Ana Ruiz (CEO and Co-Founder); Li Wei (CTO)`; a name without a title becomes "Founder" |
| `services` | | `services`: slugs or labels from the taxonomy, separated by `;` |
| `serves` | | `servesIndustries`: slugs or labels, separated by `;` |
| `keywords` | | `keywords` (separated by `;`) |
| `business model` | | `businessModel` (`B2B`, `B2C`, `B2B2C`, `B2G`, `Nonprofit`, `Unknown`) |

Any other column is ignored, with a warning, and never copied, so a sheet with an Emails or Phone
column is safe to import as is.

**Every record gets the source you name**: the page your list is published on (`--source-url` and
`--source-title`), or your organization's own records (`--org-records`). Name founders only when
the source names them founders of that company.

**Fail-closed.** Before anything is written, the import stops and names the row if a copied cell
holds an email address or phone number, a district, service or industry is not in the taxonomy, a
business model is unknown, or two rows make the same slug. Cells are copied as written; whitespace
runs become one space.

After an import, add what a sheet rarely has, by hand, with sources: descriptions from each
company's own site, services and industries served for the provider finder, documented
connections. Then `npm run validate`.

## From another app instead of a file

When the list lives in a CRM, a database or a spreadsheet an AI assistant can reach (HubSpot,
Airtable, Notion, Google Sheets), the builder's `import_companies` tool takes the same columns as
rows the assistant read, with the same checks, and previews the import before writing it. See
[mcp.md](./mcp.md#from-another-app-a-crm-a-database-a-spreadsheet).
