# ATS Board API Reference

Investigated 2026-08-04 (Ashby, Greenhouse, Lever); Workable and
SmartRecruiters added 2026-08-06; Recruitee added 2026-09-22. All six APIs are
public JSON, no authentication.

## Endpoints

| ATS | List endpoint | Per-job detail |
|-----|---------------|----------------|
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/<slug>` | not needed (description inline) |
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/<slug>/jobs` | `GET .../jobs/<id>` (adds `content`) |
| Lever | `GET https://api.lever.co/v0/postings/<slug>?mode=json` | not needed (description inline) |
| Workable | `GET https://apply.workable.com/api/v1/widget/accounts/<slug>` | none exists — description is always `null` |
| SmartRecruiters | `GET https://api.smartrecruiters.com/v1/companies/<slug>/postings?limit=100` | `GET .../postings/<id>` (adds `jobAd.sections`) |
| Recruitee | `GET https://<slug>.recruitee.com/api/offers/` | not needed (description inline) |

Ashby also accepts `?includeCompensation=true`.
Greenhouse accepts `?content=true` on the list endpoint, but that returns the
full HTML of every posting (hundreds of KB on a large board) — the CLI
deliberately fetches content per-job in `detail` instead.

## Field mapping (what the CLI normalizes to)

| Normalized | Ashby | Greenhouse | Lever |
|------------|-------|------------|-------|
| `id` | `ashby:<slug>:<id>` | `greenhouse:<slug>:<id>` | `lever:<slug>:<id>` |
| `title` | `title` | `title` | `text` |
| `location` | `location` + `secondaryLocations[].location` | `location.name` | `categories.location` |
| `date` | `publishedAt` (ISO) | `first_published` (ISO) | `createdAt` (epoch ms) |
| `url` | `applyUrl` \|\| `jobUrl` | `absolute_url` | `applyUrl` \|\| `hostedUrl` |
| `remote` | `isRemote` (boolean) | inferred from location text | `workplaceType` |
| `department` | `department` + `team` | `departments[].name` | `categories.team` |
| `description` | `descriptionPlain` | `content` (HTML, detail only) | `descriptionPlain` |

| Normalized | Workable | SmartRecruiters | Recruitee |
|------------|----------|-----------------|-----------|
| `id` | `workable:<slug>:<shortcode>` | `smartrecruiters:<slug>:<id>` | `recruitee:<slug>:<id>` |
| `title` | `title` | `name` | `title` |
| `location` | `city` + `state` + `country` | `location.{city,region,country}` | `locations[].{city,country}`, deduped |
| `date` | `published_on` | `releasedDate` (ISO) | `published_at` (`"YYYY-MM-DD HH:MM:SS UTC"`) |
| `url` | `application_url` \|\| `shortlink` | `applyUrl` \|\| `postingUrl` | `careers_url` \|\| `careers_apply_url` |
| `remote` | `telecommuting` (boolean) | `location.remote` | `remote` (boolean) |
| `department` | `department` | `department.label` | `department` |
| `description` | none — always `null` | `jobAd.sections` (detail only) | `description` + `requirements` (HTML) |

## Quirks

- **`first_published` vs `updated_at` (Greenhouse).** Both are present.
  `updated_at` changes on any edit, so using it makes months-old roles look
  new. The CLI uses `first_published` and only falls back to `updated_at`
  when it is absent.
- **Ashby `secondaryLocations`** is where EU eligibility often hides: the
  a role can read `location: "Toronto"` with `Europe` and `United Kingdom`
  among the secondary locations. Never judge geography from
  the primary location alone.
- **Ashby `isListed: false`** marks unlisted/internal postings; the CLI filters
  them out.
- **Multi-region duplicates.** Remote.com in particular posts the same role
  once per country board; expect near-identical rows.
- **Recruitee `location` is a display string, not geography.** The top-level
  `location` reads `"Remote job"` on every remote posting regardless of country.
  The real list is `locations[]`, and like Ashby's `secondaryLocations` it is
  where EU eligibility hides: a role can list several EU countries there while
  the top-level field says only `"Remote job"`.
  The CLI joins `locations[]` and falls back to `location` only when it is empty.
- **Recruitee dates are not ISO 8601** — `"2026-08-31 14:45:48 UTC"`. V8 and JSC
  both parse it today, but the CLI normalizes to ISO rather than rely on that.
- **Recruitee `careers_url` vs `careers_apply_url`.** The CLI prefers
  `careers_url` (the posting page), inverting the apply-first convention used
  for Ashby and Lever: `careers_apply_url` points at a bare `/c/new` form with
  none of the posting text, and `/daily` needs the body to check location and
  timezone gates.
- **Slug discovery.** A company's slug is usually the last path segment of its
  careers page: `jobs.ashbyhq.com/<slug>`, `boards.greenhouse.io/<slug>`,
  `jobs.lever.co/<slug>`, `<slug>.recruitee.com`. Probing all six APIs for a
  candidate slug is the fastest way to find which ATS a company uses — that is
  what `probe_slugs.py` does. **A vanity careers domain defeats this**: a
  company serving Recruitee from `jobs.<company>.com` hides the vendor from the
  URL alone. Its Recruitee slug often matches the company name, but that is a
  convention, not a rule — when a careers page is on the company's own domain,
  check the page source or its API calls for the real vendor.
- Rate limits are generous for one-request-per-company polling; the CLI still
  batches 8 at a time and retries 429/5xx with backoff.
