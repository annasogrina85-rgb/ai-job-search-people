---
name: arbeitnow-search
version: 1.0.0
description: >
  Use this skill to search job listings on Arbeitnow (arbeitnow.com), a
  Europe-centric job board (Germany-heavy, with remote and visa-sponsorship
  roles across the EU) covering tech and non-tech positions — HR, marketing,
  operations, engineering. Every posting carries an explicit remote flag and a
  city location, useful for remote-EU searches. Trigger phrases: jobs in
  Germany, jobs in Europe, EU jobs with visa sponsorship, remote jobs in the
  EU, Stellenangebote, HR Stellen, jobs on Arbeitnow, look up this Arbeitnow
  posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/arbeitnow-search/cli/src/cli.ts *)
---

# Arbeitnow Search Skill

Search live job listings from **[Arbeitnow](https://www.arbeitnow.com)** via
its public JSON API. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`.

Arbeitnow is Europe-centric (strongest in Germany) and lists both remote and
on-site roles; each posting has an explicit `remote` boolean and a city
`location`. Postings are frequently in English, some in German.

## When to use this skill

- Search recent European postings by keyword, remote-only if desired
- Sweep the German/EU market beyond LinkedIn's reach
- Read full descriptions straight from search results (JSON format)
- Look a posting up by its slug (`detail`)

## Commands

### Search job listings

```bash
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keywords; **all terms must match**
  (client-side over title, company, location, tags, description). Use short
  queries ("hr", "recruiter", "people") rather than long phrases.
- `--remote <mode>` — `remote` | `onsite` (the feed has no hybrid flag).
- `--jobage <days>` — posted within N days (client-side).
- `--page <n>` — 1-indexed result page (client-side). Default 1.
- `--limit <n>` / `-n <n>` — results per page. Default 25.
- `--format json|table|plain` — default `json`.

**No server-side search exists** — the CLI fetches the newest 4 feed pages
(~700 postings) and filters locally. Recency beats depth: pair `--query` with
`--jobage` and scrape often rather than paging deep into history.

### Fetch full job detail

```bash
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts detail <slug|url> [--format json|plain]
```

`slug` is the `id` from `search` results (e.g.
`people-operations-manager-berlin-60723`); a full arbeitnow.com job URL also
works. `detail` scans the newest 8 feed pages — older postings must be read
from their public URL.

## Usage examples

```bash
# Remote HR roles, last 7 days
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q hr --remote remote --jobage 7 --format table

# Recruiter roles anywhere in the feed (remote or on-site)
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q recruiter --format table

# People-ops roles, remote only
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q people --remote remote --format table

# Berlin on-site HR roles
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts search -q "hr berlin" --format table

# Full details for a specific job
bun run .agents/skills/arbeitnow-search/cli/src/cli.ts detail <slug-from-search> --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use; the only format carrying descriptions |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "total" }, "results": [...] }`;
each result has at least `id`, `title`, `company`, `location`, `date`, `url`
(missing values are `null`), plus `remote`, `tags`, `jobTypes`. Errors go to
**stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- Data is Arbeitnow's public job-board API — no credentials required; keep
  volume low (a search command makes at most 4 requests).
- `remote: true` does **not** state a geography — most remote Arbeitnow roles
  still expect an EU/Germany-compatible timezone, but verify against the
  description.
- German-language postings match German keywords only — try both ("hr
  personalreferent", "recruiter personalberater") when sweeping broadly.
- `tags` are sparse; don't rely on them for filtering.
