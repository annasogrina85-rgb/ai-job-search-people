---
name: ats-watch
version: 1.0.0
description: >
  Use this skill to catch newly-posted roles at a curated list of target
  companies within hours of publication, by polling their ATS job boards
  (Ashby, Greenhouse, Lever, Workable, SmartRecruiters, Recruitee) directly
  rather than searching an aggregator.
  Unlike portal search, an ATS board returns the employer's COMPLETE list of
  open roles with an exact publish timestamp, so nothing is lost to search
  ranking and "posted in the last 24 hours" is an exact filter, not a guess.
  Built for same-day applying. Trigger phrases: new jobs today, what was
  posted today, fresh vacancies, jobs posted in the last 24 hours, check
  company career pages, daily job sweep, is <company> hiring.
context: fork
enabled: true  # set to false to keep this portal installed but have /scrape skip it
allowed-tools: Bash(bun run .agents/skills/ats-watch/cli/src/cli.ts *)
---

# ATS Watch Skill

Polls the **public job-board APIs of employers' own applicant-tracking
systems** — Ashby, Greenhouse, Lever, Workable, SmartRecruiters and
Recruitee — across a curated company registry (190 companies as of
2026-09-22). No authentication, no API key, and **zero runtime dependencies**.

Workable's public widget API carries no job-description field (and its job
pages are a client-rendered SPA, nothing to scrape server-side), so Workable
results always have `description: null`. Every other ATS type here carries a
full description, either inline (Ashby, Lever, Recruitee) or via `detail`
(Greenhouse, SmartRecruiters).

## Why this exists (the failure it fixes)

Aggregator search is lossy. In an early sweep a near-perfect role (a senior
Talent Development position at a well-known AI company) was missed by a full
LinkedIn sweep for two independent reasons:

1. **LinkedIn's public guest search returns a ranked subset**, not everything.
   The role was absent even from a company-scoped `-q "<Company>"` query across
   three pages, while LinkedIn's *detail* endpoint served it fine.
2. **It was 39 days old.** A `--jobage 14` recency filter would have excluded
   it regardless. Roles stay open far longer than they stay "fresh" in search.

An ATS board has neither problem: it is the employer's own source of truth,
lists every open posting, and carries a precise `publishedAt`.

A second, different failure added Recruitee as the sixth vendor. A strong-fit
People Business Partner role (~85/100, open to the candidate's country) was
invisible to the daily sweep because the employer hosts its board at
`jobs.<company>.com`, a vanity domain over Recruitee, which this skill did not
support. `probe_slugs.py` reported 0 live boards for the same reason, so the
discovery pass could not rescue it either;
the role was only found by scraping the board's HTML by hand. The lesson is
the coverage boundary below: **an unsupported vendor fails silently**, looking
exactly like a company that simply is not hiring.

## When to use this skill

- The **daily sweep**: what appeared at any target company in the last 24 hours
- Checking whether a specific company is hiring in the People function
- Getting an exact publication age, to prioritise same-day applications
- Reading a full job description without scraping a careers page

Use it **alongside** portal skills (`linkedin-search`, `jobicy-search`,
`arbeitnow-search`), never instead of them: ATS watch has perfect depth on a
narrow company list, portals have shallow depth across the whole market.

## Commands

### Search

```bash
bun run .agents/skills/ats-watch/cli/src/cli.ts search [flags]
```

Key flags:
- `--hours <n>` — only roles published within the last N hours. This is the
  same-day-apply filter; omit it to see everything currently open.
- `--family <name>` / `-f` — `people` (default) or `all`. The `people` family
  matches People/HR/Talent/OD/L&D titles and excludes engineering and GTM
  titles that share vocabulary (notably "machine learning").
- `--query <text>` / `-q` — extra keyword filter over title, company,
  location, department and (where available) description.
- `--company <name>` / `-c` — restrict to one company (slug or name substring).
- `--remote` — keep only roles that read as remote / EMEA / Europe / anywhere.
- `--with-description` — include full descriptions (JSON format only).
- `--page <n>`, `--limit <n>` / `-n`, `--format json|table|plain`.

Results are **sorted newest-first**; a posting whose date cannot be parsed is
kept but sorted last (never silently dropped).

### Detail

```bash
bun run .agents/skills/ats-watch/cli/src/cli.ts detail <ats:slug:jobid> [--format json|plain]
```

`id` is the composite id from `search` (e.g.
`ashby:<slug>:<job-uuid>`). Ashby and Lever carry
descriptions inline in search; Greenhouse needs this per-job fetch.

### Companies

```bash
bun run .agents/skills/ats-watch/cli/src/cli.ts companies
```

Prints the tracked registry. Edit `companies.json` to add or remove targets —
no code change needed.

## Usage examples

```bash
# The daily sweep: People roles posted in the last 24 hours, remote-ish
bun run .agents/skills/ats-watch/cli/src/cli.ts search --hours 24 --remote --format table

# Wider net for a Monday catch-up
bun run .agents/skills/ats-watch/cli/src/cli.ts search --hours 72 --remote --format table

# Everything People-shaped currently open at one company
bun run .agents/skills/ats-watch/cli/src/cli.ts search -c <slug> --format table

# HRBP-flavoured roles anywhere in the registry
bun run .agents/skills/ats-watch/cli/src/cli.ts search -q "business partner" --format table

# Full description of one posting
bun run .agents/skills/ats-watch/cli/src/cli.ts detail ashby:<slug>:<job-uuid> --format plain
```

## Output formats

| Format | Best for |
|--------|----------|
| `json` | Default — programmatic use; the only format carrying descriptions |
| `table` | Quick scanning; leads with an AGE column (`7h`, `4d`) |
| `plain` | Reading a single posting (`detail`) |

Search JSON is `{ "meta": { "count", "page", "total", "companiesPolled", "boardErrors" }, "results": [...] }`.
Each result has at least `id`, `title`, `company`, `location`, `date`, `url`,
plus `ats`, `remote`, `ageHours`, `department`. Errors go to **stderr** as
`{ "error": "...", "code": "..." }` with exit code `1`.

## Notes

- A board that fails is reported in `meta.boardErrors` and never aborts the
  sweep — one dead company must not cost the whole run.
- Polling is batched 8 companies at a time; a full 190-company sweep takes
  ~30s and makes one request per company.
- `date` is the true publish moment (`publishedAt` on Ashby,
  `first_published` on Greenhouse, `createdAt` on Lever, `published_at` on
  Recruitee). Greenhouse's `updated_at` is deliberately **not** used: it drifts
  on every edit and would make stale roles look fresh. Recruitee stamps dates
  as `2026-08-31 14:45:48 UTC` rather than ISO 8601; the CLI normalizes them so
  `--hours` never depends on JS engine date leniency.
- **Recruitee geography lives in `locations[]`, not `location`.** The top-level
  `location` is a display string (`"Remote job"`); the CLI joins every entry of
  `locations[]` instead, which is where EU eligibility hides — a remote
  posting can be open to several named countries while only `locations[]`
  says so. Same trap as Ashby's `secondaryLocations`.
- The registry is the coverage boundary, and so is the vendor list. This
  skill can only see companies listed in `companies.json`, on one of the six
  supported ATS platforms — that is the trade for completeness and speed. A
  company on an unsupported vendor reads as "not hiring", which is how the
  Recruitee-hosted role above was missed; when a target company looks suspiciously quiet, check what its
  careers page actually runs on.
- Some employers post one role to several regional boards; near-duplicate rows
  differing only by location are expected (`/scrape` Step 2.5 consolidates them).
