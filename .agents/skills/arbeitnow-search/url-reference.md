# Arbeitnow API Reference

Investigated 2026-08-04. Public JSON API, no authentication.
Docs: https://www.arbeitnow.com/api/job-board-api (terms in `meta.terms`).

## Endpoint

`GET https://www.arbeitnow.com/api/job-board-api?page=<n>`

- 175 jobs per page, newest-first by `created_at`
- `links.next` is null on the last page
- No search/filter/date parameters — all filtering is client-side

## Response shape

`{ data: [...], links: { next }, meta: { current_page, per_page, terms } }`;
each job:

- `slug` — stable id, also the detail-page path segment (**the CLI's `id`**)
- `company_name`, `title`
- `description` — full posting HTML (CLI strips to text); language mixes
  English and German
- `remote` (boolean) — explicit remote flag
- `url` — public posting URL (`/jobs/companies/<company>/<slug>`)
- `tags` (string[]) — sparse role tags, e.g. `["Human Resources"]`
- `job_types` (string[]) — e.g. `["professional / experienced"]`, German terms
  appear too
- `location` — city, e.g. `"Berlin"`, sometimes `"Remote"` or empty
- `created_at` — unix seconds

## Quirks

- Corpus is Germany-heavy; remote roles usually assume EU-compatible hours.
- The API also exists in a visa-sponsorship variant
  (`/api/job-board-api?visa_sponsorship=true`) — not wired into the CLI today;
  add a flag if visa filtering becomes relevant.
- Terms (in `meta.terms`) require attribution with a link when republishing
  data publicly; personal job-search use is fine.
