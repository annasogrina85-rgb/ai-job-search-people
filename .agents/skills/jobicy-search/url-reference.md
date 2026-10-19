# Jobicy API Reference

Investigated 2026-08-04. Public JSON API, no authentication.
Docs: https://jobicy.com/jobs-rss-feed (API section).

## Endpoint

`GET https://jobicy.com/api/v2/remote-jobs`

## Query parameters

| Param | Notes |
|-------|-------|
| `count` | number of jobs, default 50, max 50 |
| `geo` | candidate region slug: `europe`, `emea`, `uk`, `germany`, `france`, `spain`, `netherlands`, `poland`, `portugal`, `latam`, `apac`, `usa`, `canada`, `anywhere`, … |
| `industry` | `hr` (HR & Recruiting), `marketing`, `management` (Management & Operations), `supporting` (Customer Support), `accounting-finance`, `dev`, `design-multimedia`, `data-science`, `copywriting`, `business`, `legal`, `sales`, … |
| `tag` | keyword filter over title/description |

No date or pagination parameters — the CLI filters posting age and pages
client-side within the 50-job window. **Unknown slugs are silently ignored**
(the API returns the unfiltered feed and echoes what it applied in
`appliedFilters` — check it when debugging).

## Response shape

`{ apiVersion, jobCount, appliedFilters, jobs: [...] }`; each job:

- `id` (number), `url`, `jobSlug` (`<id>-<title-slug>`)
- `jobTitle`, `companyName`, `companyLogo`
- `jobIndustry` (string[], HTML-entity-encoded — decode `&amp;`)
- `jobType` (string[]) — `Full-Time`, etc.
- `jobGeo` — candidate eligibility region (**key field for EU filtering**):
  `"EMEA"`, `"Europe"`, `"Anywhere"`, country names
- `jobLevel` — free-ish text: `"Senior"`, `"Entry-Level, Junior"`, …
- `jobExcerpt`, `jobDescription` (HTML; CLI strips to text)
- `pubDate` — ISO timestamp with timezone
- `annualSalaryMin/Max`, `salaryCurrency` — present on a minority of postings

## Quirks

- The feed window is the newest 50 postings **per filter combination** — deep
  history is not reachable; run scrapes frequently instead of paging.
- `detail` works by re-fetching the feed; postings older than the window must
  be read from their public URL.
- Jobicy's friendly notice asks for ≤1 request/sec and attribution when
  republishing. Personal job-search use is fine; keep volume low.
