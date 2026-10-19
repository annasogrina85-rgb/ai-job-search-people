# Search Queries for Job Scraper

<!-- Example tuning: senior systems-level People roles
     (Senior HRBP / People Partner, Head of People, OD & People Systems),
     remote EU / EU-compatible worldwide, English-language postings.
     Re-tune via /setup for your own target roles. -->

## Installed portal CLIs (primary for `/scrape`)

`/scrape` discovers every portal skill under `.agents/skills/*/SKILL.md` and runs its CLI first. Active portals for this fork:

- **ats-watch** — **primary source for freshness.** Polls target companies' own ATS boards (Ashby/Greenhouse/Lever) directly: complete listings, exact publish timestamps, no search ranking. This is the only source that reliably supports same-day applying. Company registry: `.agents/skills/ats-watch/companies.json` — extend it whenever a new target company appears.
- **himalayas-search** — **primary breadth source, cross-company.** Reads a feed of ~105k live remote postings spanning every employer Himalayas has ingested, so it is not bounded by `companies.json` the way ats-watch is. Each posting carries structured `locationRestrictions` (country names) and `timezoneRestrictions` (numeric UTC offsets), so the Location and Timezone gates can be decided from the feed instead of from a fetched body. Default `--scope eligible` drops roles pinned to a country the candidate cannot work from. No server-side filtering exists (`category`/`q` are accepted and ignored), so keep `--hours` tight — paging stops at the date cutoff. **Always read `meta.truncated`**: true means partial coverage, not "nothing found". Lags real publication ~4h, so ats-watch stays primary for same-day.
- **linkedin-search** — primary breadth source. Run each query once per location anchor (see Location strategy below). Always pass **`--triage-remote`**: LinkedIn's guest endpoint ignores `--remote remote` (`f_WT` has no server-side effect, verified by diffing job IDs), so the CLI filters client-side on location specificity instead. Without it a sweep fetches city-pinned office roles that die at the location gate — 14 of 15 scored roles in one early run.
- **jobicy-search** — remote-only board with server-side geo. Use `-i hr -g europe` and `-g emea`; also `-g anywhere` swept with the Timezone Gate in mind. **A run of zero new EU results is normal, not a failure**: the `hr` industry feed is healthy and updates daily, but almost all of it is `USA`/`LATAM` geo, so `geo=europe` legitimately returns a thin, slow-moving slice — in testing nothing newer than a week, while unfiltered `industry=hr` had postings from that same day. `geo=anywhere` combined with `industry=hr` returns 0 because that bucket is currently empty, not because the parameter is wrong. Check the unfiltered feed before reporting jobicy as broken.
- **arbeitnow-search** — Europe/Germany-centric feed. Use `--remote remote` with short keyword queries ("hr", "recruiter", "people", "talent"). **Run its queries one at a time, never concurrently:** each search walks up to 4 feed pages and the API rate-limits hard. Measured: 6 concurrent queries → 2 failed with 429 even with backoff; the same 6 run sequentially → 6/6 in ~59s.
- **freehire-search** — tech-first faceting; only useful for HR-in-tech sweeps (`--remote remote --region eu,none`), low priority.

Danish demo portals (jobindex, jobnet, jobdanmark, jobbank) are installed but **disabled** (`enabled: false`) — not relevant for a remote-EU search.

The `site:` query templates below are the **WebSearch fallback** — for boards without a CLI, company career pages, or when a CLI fails.

**Language scope:** query in the candidate's working languages from the Languages table in `01-candidate-profile.md`. Example: English is the query language because the international remote-EU market posts in English; add sweeps in another declared working language only on request; skip languages the candidate does not work in. Language requirements inside postings are handled by the Language Gate in `04-job-evaluation.md`.

## Search Sites

Primary (covered by CLIs): linkedin.com/jobs, jobicy.com, arbeitnow.com

Secondary (WebSearch fallback — no CLI available):
- **weworkremotely.com** — HR & Recruiting category (RSS/API is bot-blocked; use `site:` queries)
- **remote.co**, **euremotejobs.com**, **remoteeurope.com** — remote/EU boards without APIs
- **Company ATS pages** — `site:jobs.lever.co`, `site:boards.greenhouse.io`, `site:apply.workable.com` + role keywords + "remote" "Europe"

## Location strategy (remote EU)

There is no single "EU remote" location string on LinkedIn. Run each priority query against these anchors with `--remote remote`:
- `"European Union"` — LinkedIn's EU-wide region
- `"Europe"` and `"EMEA"` — where supported
- `"<COUNTRY>"` — the candidate's country of residence, to catch country-scoped remote postings
- `"Worldwide"` / `"Remote"` — global sweep; every hit must then pass the Timezone & Working-Hours Gate (`04-job-evaluation.md`)

## Query Categories

### Priority 0: ATS-board sweep (run first, every day)

```
ats-watch: search --hours 24 --remote --format table      # the daily same-day sweep
ats-watch: search --hours 72 --remote --format table      # Monday / after-a-break catch-up
ats-watch: search -q "business partner" --format table    # thematic sweep across all boards
ats-watch: search -c <company> --format table             # is this company hiring in People?

# Cross-company companion — run every day alongside the above. ats-watch answers
# "what went live at the companies we track"; this answers "what went live anywhere".
himalayas-search: search --hours 30 --role-family hr --scope eligible --format json
himalayas-search: search --hours 30 --role-family hr --scope eu --format table   # incl. re-domicile
himalayas-search: search --hours 30 --role-family hr --scope any --no-tz --format table  # full funnel
```

Coverage boundary: this sees only companies in `companies.json` (across 6 ATS types: Ashby, Greenhouse, Lever, Workable, SmartRecruiters, Recruitee). Add every company the candidate targets or interviews with, so a future opening is caught on day one.

### Priority 1: Core HR / People Ops roles

```
linkedin-search: -q "hr business partner" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "people partner" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "head of people" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "people operations" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "organizational development" -l "European Union" --remote remote --triage-remote
jobicy-search:   -i hr -g europe
jobicy-search:   -i hr -g emea
arbeitnow-search: -q people --remote remote
arbeitnow-search: -q hrbp --remote remote
site:weworkremotely.com "people operations" OR "HRBP" OR "head of people" remote Europe
```

Core titles (example for a senior People profile): **Senior HRBP / HR Business Partner, Senior People Partner, Head of People, People Experience Lead, Organizational Development / People Systems roles, Performance Management Architect**. Seniority: senior/lead/head — skip junior and coordinator-level postings.

### Priority 1b: Organisational design and change

Example for a candidate whose role-type preference (`01-candidate-profile.md`) puts org design and change management above traditional HR and excludes HR operations. Run these every day alongside Priority 1.

```
linkedin-search: -q "organizational design" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "change management" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "organisational effectiveness" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "transformation lead" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "ways of working" -l "European Union" --remote remote --triage-remote
site:jobs.ashbyhq.com OR site:job-boards.greenhouse.io OR site:jobs.lever.co "organizational design" OR "change management" OR "organisational development" remote Europe
```

Filter out consultancy delivery roles on client sites, ERP/IT change roles (SAP, Workday rollouts) and finance or cyber "transformation", which share the vocabulary but not the work.

### Priority 2: Performance / People systems / AI×HR specialist roles

Often a strong differentiator for a systems-minded People profile — roles named after the systems the candidate builds.

```
linkedin-search: -q "performance management" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "people systems" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "people experience" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "talent management" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "hr transformation" -l "European Union" --remote remote --triage-remote
site:jobs.lever.co OR site:boards.greenhouse.io "performance management" OR "people systems" remote Europe
linkedin-search: -q "performance partner" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "people performance" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "organisation design" -l "European Union" --remote remote --triage-remote
site:jobs.ashbyhq.com "player-coach" OR "no management layers" OR "HR experience is welcome but not required" people
site:jobs.ashbyhq.com OR site:job-boards.greenhouse.io "performance partner" OR "people performance" remote Europe
```

The last five lines target the example "target archetype": flat structure, build-the-system mandate, automation expected, open to operators. See `04-job-evaluation.md`, Career Alignment.

### Priority 2b: Talent acquisition leadership (not IC recruiting)

```
linkedin-search: -q "head of talent" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "talent acquisition lead" -l "European Union" --remote remote --triage-remote
arbeitnow-search: -q talent --remote remote
```

### Priority 2c: HR AI / automation / people technology

This line exists for candidates interested in the People × AI intersection. It was
calibrated on one good example (an *HR AI & Automation Operations Lead* posting) and
one counter-example (a data-operations team-lead role with an AI label). The
condition: **an interesting match, as long as the technical requirements are not
too heavy.**

```
linkedin-search: -q "hr automation" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "people technology" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "hr technology" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "hr ai" -l "European Union" --remote remote --triage-remote
site:jobs.ashbyhq.com OR site:boards.greenhouse.io "HR Automation" OR "People Technology" OR "HR AI" remote
```

**The dividing line, and it is the whole point of this category.** Take the role
when AI and automation are the *subject of design*; drop it when they are the
*subject of implementation*.

| Take it | Drop it |
|---------|---------|
| Deciding what to automate and what stays human | Writing the integration |
| Human-in-the-loop checkpoints, maker/checker, guardrails | Building the pipeline that runs them |
| Accountability when a system and a person disagree | On-call for when it breaks |
| Process redesign *before* automation | Dashboard/report production |
| Low-code named as a tool (Zapier, Make, n8n, Retool) | Python / TypeScript / JavaScript as a stated requirement |
| "Partner engineering to build X" | "Build X" |

**Concrete reject signals** — if the requirements list any of these as required
(not "nice to have"), the role belongs to an HR-engineering function and fails
the pre-filter: hands-on Python/TypeScript/JavaScript; SQL plus a BI tool
(Tableau, Sigma, Looker) as a core duty; owning APIs, webhooks, message queues;
automation observability (logging, tracing, run evaluation) as the job rather
than as a governance requirement.

**Two failure modes this category will produce, so check for both before
drafting:**

1. **A data-operations role wearing an AI label.** The counter-example led 50+
   freelancers on data-generation pipelines, LinkedIn job function *Information
   Technology*, with low comp. It matched on the word "AI" and on nothing else.
   Check what the team actually *produces* — if it is data rather than people
   outcomes, it is not this category.
2. **An undisclosed employer.** Intermediary postings ("on behalf of a partner
   company") make the **Sector Gate unverifiable**, which is a gate failure in
   itself, not a question to pass to the candidate. See the Sector Filter below.

These roles are also the most likely in the whole sweep to be posted by
engineering rather than People, so expect a high technical-requirement rate and
report what this line actually yields for the first couple of weeks — if it
returns mostly rejects, tighten the queries rather than quietly keeping it.

### Priority 3: Adjacent people-function roles

```
linkedin-search: -q "people analytics" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "employer branding" -l "European Union" --remote remote --triage-remote
linkedin-search: -q "learning and development" -l "European Union" --remote remote --triage-remote
```

Removed in this example configuration: "compensation benefits" and "hr operations" queries — they returned operations roles almost exclusively, which the example role-type preference excludes.

Adjacencies that fit the systems-design mandate: people analytics, performance management, career architecture, L&D/leadership development, org design consulting, HR transformation, AI adoption/enablement roles in People teams. Skip pure C&B, HR compliance, and transactional-recruiting roles.

### Priority 4: Global sweep (Timezone Gate mandatory)

```
linkedin-search: -q "people operations" -l "Worldwide" --remote remote --triage-remote
jobicy-search:   -i hr -g anywhere
site:jobs.lever.co OR site:boards.greenhouse.io "people operations" remote "Europe" OR "EMEA" OR "CET"
```

Every result from this category must pass the Timezone & Working-Hours Gate before it reaches the ranked list — "worldwide" postings demanding US/AUS business hours are excluded there.

## Location Filter

This is a **remote-only** search. Apply the Timezone & Working-Hours Gate from `04-job-evaluation.md` to every posting:
- Remote EU / EMEA / EU-timezone-stated: include
- Worldwide with no timezone requirement: include, verify team-location hints
- Partial US-overlap requirements (stretchable): include with FLAG + local-time translation
- Full US / Canadian / LATAM / Australian business hours, or non-EU-only hiring regions: exclude (report with quote)
- Hybrid/on-site postings: exclude regardless of geography

## Sector Filter

**Example: gambling / iGaming / betting is excluded** (Sector Gate in `04-job-evaluation.md`). Drop these before ranking, and never draft a package for one. Watch for employers who describe themselves as "advisory", "services group" or "entertainment" while their revenue comes from betting brands — check ownership and sub-brands, not the About page.

**Example: sanctioned companies are excluded** (Sector Gate in `04-job-evaluation.md`). For any crypto, payments or fintech posting with an opaque/offshore holding structure, run a quick "[company] sanctions" / "[company] regulator licence revoked" check before ranking — a posting can read as completely ordinary while the employer is under active sanctions.

## Language Filter

Working languages and levels live in CLAUDE.md's Languages table. Apply `04-job-evaluation.md`'s Language Gate: a posting requiring an undeclared language as a job condition is excluded; a higher-than-declared bar in a declared language is flagged, not excluded. Postings merely *written* in another language, with no on-the-job requirement, pass.

## Date Filter

**Recency is a ranking signal, not only a filter.** Applying within 24 hours of publication materially changes the odds of reaching an interview, so a fresh posting outranks an older one at equal fit.

- `ats-watch` gives an exact publish timestamp; use `--hours 24` for the daily sweep.
- Portal CLIs are day-granular at best; use their smallest recency window (`--jobage 1`) for daily runs.
- For a **catch-up or thematic** sweep, do not impose a 14-day cutoff on `ats-watch`: roles stay open much longer than they stay "fresh" in aggregator search. A strong-fit Talent Development role missed in an early sweep had been open 39 days and was still actively hiring.
- If a posting date cannot be determined, include it and flag as "date unknown".
- jobicy's feed window is the newest 50 postings per filter — sweep at least weekly so nothing scrolls past the window.

## Adapting Queries

If the user specifies a focus area, select queries from the matching category and also generate 2-3 custom queries for that focus. For example:
- "/scrape talent acquisition" -> Priority 2 queries + custom TA-specific queries
- "/scrape [company]" -> `site:` queries against that company's ATS + linkedin-search with the company name
