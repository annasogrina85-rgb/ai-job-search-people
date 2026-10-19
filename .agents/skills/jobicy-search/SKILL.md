---
name: jobicy-search
version: 1.0.0
description: >
  Use this skill to search fully-remote job listings on Jobicy (jobicy.com), a
  remote-work job board with server-side region filtering (Europe, EMEA, UK,
  Germany, Anywhere, …) and industry filtering including HR & Recruiting,
  marketing, management, and support. Ideal for remote-EU searches: every
  posting carries a candidate geo (e.g. "EMEA", "Europe") plus a seniority
  level. Trigger phrases: remote jobs in Europe, remote EU vacancies, remote HR
  jobs, remote recruiter roles, EMEA remote positions, jobs on Jobicy, look up
  this Jobicy posting.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/jobicy-search/cli/src/cli.ts *)
---

# Jobicy Search Skill

Search live remote-only job listings from **[Jobicy](https://jobicy.com)** via
its public JSON API. No authentication, no API key, and **zero runtime
dependencies** — it runs with just `bun`.

Jobicy filters geography **server-side**: `--geo europe` / `--geo emea` return
only postings open to candidates in those regions, so remote-EU screening
happens at the source. Each result also carries a seniority level and industry.

## When to use this skill

- Search remote openings open to EU/EMEA candidates (`--geo europe`, `--geo emea`)
- Filter by industry (`--industry hr` for HR & Recruiting) and keyword
- Read full descriptions straight from search results (JSON format)
- Look a posting up by its id (`detail`)

## Commands

### Search job listings

```bash
bun run .agents/skills/jobicy-search/cli/src/cli.ts search [flags]
```

Key flags:
- `--query <text>` / `-q <text>` — keyword filter (server-side, title + description).
- `--geo <slug>` / `-g <slug>` — candidate region: `europe`, `emea`, `uk`,
  `germany`, `france`, `netherlands`, `anywhere`, … (see `url-reference.md`).
- `--industry <slug>` / `-i <slug>` — e.g. `hr` (HR & Recruiting), `marketing`,
  `management`, `supporting`, `accounting-finance`, `dev`.
- `--jobage <days>` — posted within N days (client-side).
- `--page <n>` — 1-indexed page (client-side). Default 1.
- `--limit <n>` / `-n <n>` — results per page. Default 25.
- `--format json|table|plain` — default `json`.

**The API serves the newest 50 postings per query** — narrow with `--geo` /
`--industry` / `--query` rather than paging deep. Search results already carry
the full description (JSON format only) — do not loop `detail` over search hits.

### Fetch full job detail

```bash
bun run .agents/skills/jobicy-search/cli/src/cli.ts detail <id|url> [--format json|plain]
```

`id` is the numeric id from `search` results; a jobicy.com job URL also works.
`detail` can only see the newest 50-posting feed window — for an older tracked
posting, read its `url` directly instead.

## Usage examples

```bash
# Remote HR & Recruiting roles open to Europe
bun run .agents/skills/jobicy-search/cli/src/cli.ts search -i hr -g europe --format table

# Recruiter keyword search across EMEA, last 14 days
bun run .agents/skills/jobicy-search/cli/src/cli.ts search -q recruiter -g emea --jobage 14 --format table

# People-ops roles open to candidates anywhere
bun run .agents/skills/jobicy-search/cli/src/cli.ts search -q "people operations" -g anywhere --format table

# All recent HR postings regardless of region (for manual triage)
bun run .agents/skills/jobicy-search/cli/src/cli.ts search -i hr --jobage 7 --format table

# Full details for a specific job
bun run .agents/skills/jobicy-search/cli/src/cli.ts detail 150122 --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use; the only format carrying descriptions |
| `table` | Quick human-readable scanning |
| `plain` | Reading a single job's full detail (`detail` command) |

Search JSON is `{ "meta": { "count", "page", "total" }, "results": [...] }`;
each result has at least `id`, `title`, `company`, `location`, `date`, `url`
(missing values are `null`). `location` holds the candidate geo (e.g. "EMEA").
Errors go to **stderr** as `{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- Data is Jobicy's public API — no credentials. Jobicy asks for ≤1 request/sec;
  each CLI command makes exactly one API request.
- `jobGeo` values like `"EMEA"` or `"Europe"` are the **candidate eligibility
  region**. `"Anywhere"` postings still deserve a timezone sanity-check against
  the description.
- Seniority (`level`) comes from Jobicy's own tagging and can be broad
  (e.g. "Entry-Level, Junior").
- Unknown `--geo`/`--industry` slugs are ignored by the API (it returns the
  unfiltered feed) — stick to the slugs in `url-reference.md`.
