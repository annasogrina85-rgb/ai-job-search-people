// Data source: Himalayas' public jobs API (https://himalayas.app/jobs/api).
// JSON, no authentication, no API key. Unlike ats-watch (which polls a fixed
// company registry) this feed is CROSS-COMPANY: it indexes every employer
// Himalayas has ingested, so it answers "what went live anywhere", not "what
// went live at the 83 companies we happen to track".
//
// Three quirks that shape this client:
//
//  1. `limit` is silently capped at 20 regardless of what you ask for. Breadth
//     comes from cursor paging, not from a bigger page.
//  2. The feed is sorted newest-first and there is NO server-side filter — the
//     `category`/`q`/`search` params are accepted and ignored (verified
//     2026-09-08: totalCount stays ~105k whatever you pass). Every filter in
//     this CLI is therefore client-side, and recency paging is what keeps the
//     request count sane: stop as soon as pubDate falls out of the window.
//  3. Descriptions contain RAW control characters inside JSON strings, which
//     both JSON.parse and Python's strict json.loads reject. Responses must be
//     sanitized before parsing — see parseLenientJson.

export const API_URL = "https://himalayas.app/jobs/api"

/** The API caps page size at 20 no matter what `limit` is set to. */
export const PAGE_SIZE = 20

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * JSON.parse, but tolerant of the raw control characters Himalayas emits inside
 * description strings. Strips C0 controls except the \t \n \r that JSON.parse
 * would itself reject unescaped — those become spaces so word boundaries survive.
 */
export function parseLenientJson<T>(raw: string): T {
  // eslint-disable-next-line no-control-regex
  const sanitized = raw.replace(/[\u0000-\u001F]/g, (c) =>
    c === "\t" || c === "\n" || c === "\r" ? " " : "",
  )
  return JSON.parse(sanitized) as T
}

/** Fetch + lenient-parse with exponential backoff on 429/5xx. null on 404. */
export async function jsonFetch<T>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return parseLenientJson<T>(await response.text())
  }
  throw new Error("Request failed after max retries")
}

/** Raw job shape from the Himalayas feed. */
export interface HimalayasJob {
  title: string
  excerpt?: string
  companyName: string
  companySlug?: string
  employmentType?: string | string[]
  minSalary?: number | null
  maxSalary?: number | null
  salaryPeriod?: string | null
  currency?: string | null
  seniority?: string[] | string | null
  /** Country names, e.g. ["Spain"]. Empty/absent = no location restriction. */
  locationRestrictions?: string[] | null
  /** Numeric UTC offsets, e.g. [1] for CET, [-8,-7,-6,-5] for US. */
  timezoneRestrictions?: number[] | null
  categories?: string[] | null
  parentCategories?: string[] | null
  description?: string
  /** Unix epoch seconds. */
  pubDate: number
  expiryDate?: number
  applicationLink?: string
  guid: string
}

export interface FeedResponse {
  totalCount: number
  nextCursor: string | null
  jobs: HimalayasJob[]
}

/** Normalized result honoring the portal-skill contract shared with the other CLIs. */
export interface JobResult {
  id: string
  title: string
  company: string | null
  companySlug: string | null
  /** Human-readable rendering of locationRestrictions. */
  location: string | null
  /** ISO-8601, so it sorts and reads like the other portals' `date`. */
  date: string | null
  url: string
  level: string | null
  salary: string | null
  /** Raw structured gate inputs, kept so the caller can re-check the decision. */
  locationRestrictions: string[]
  timezoneRestrictions: number[]
  /** Why this row survived the location filter — "unrestricted" | "home" | "region". */
  locationBasis: string
  description: string | null
}

function asArray<T>(v: T[] | T | null | undefined): T[] {
  if (v === null || v === undefined) return []
  return Array.isArray(v) ? v : [v]
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------

/** EU-27 + EEA + Switzerland, lowercased. */
export const EU_COUNTRIES = new Set(
  [
    "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czech Republic", "Czechia",
    "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary", "Ireland",
    "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland",
    "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
    "Iceland", "Liechtenstein", "Norway", "Switzerland",
  ].map((c) => c.toLowerCase()),
)

/**
 * Tokens that denote a whole region rather than one country. A posting carrying
 * one of these is open EU-wide, so it stays in scope for a candidate anywhere in
 * the EU rather than being pinned to a single member state.
 */
export const REGION_TOKENS = new Set(
  ["europe", "european union", "eu", "emea", "worldwide", "anywhere", "global", "remote"].map((c) =>
    c.toLowerCase(),
  ),
)

/**
 * Decide whether a posting is takeable, and say on what grounds.
 *
 * The distinction matters because single-country restrictions are the single
 * most common way a promising role dies for this search: Booksy (Poland only),
 * PLOS (UK + 8 US states), Masabi (Romania only) and TrustedHousesitters (UK tax
 * residency) were all cut on exactly this in the weeks before this CLI existed.
 * "Germany only" is not a remote-EU role for someone living elsewhere, and
 * scope `eligible` is what encodes that.
 */
export function classifyLocation(
  restrictions: string[],
  homeCountry: string,
  scope: "eligible" | "eu" | "any",
): { keep: boolean; basis: string } {
  if (scope === "any") return { keep: true, basis: "unfiltered" }
  if (restrictions.length === 0) return { keep: true, basis: "unrestricted" }

  const lowered = restrictions.map((r) => r.trim().toLowerCase())
  const home = homeCountry.trim().toLowerCase()

  if (lowered.some((r) => REGION_TOKENS.has(r))) return { keep: true, basis: "region" }
  if (lowered.includes(home)) return { keep: true, basis: "home" }
  if (scope === "eu" && lowered.some((r) => EU_COUNTRIES.has(r))) {
    return { keep: true, basis: "eu-other" }
  }
  return { keep: false, basis: "restricted" }
}

/**
 * Timezone gate, mechanized. `offsets` are UTC offsets the employer will accept.
 * Empty means unstated, which is not a failure — it just isn't evidence either
 * way, so it passes here and the posting body remains the authority.
 */
export function timezoneCompatible(offsets: number[], min: number, max: number): boolean {
  if (offsets.length === 0) return true
  return offsets.some((o) => o >= min && o <= max)
}

// ---------------------------------------------------------------------------
// Normalization + filters
// ---------------------------------------------------------------------------

export function normalizeJob(
  job: HimalayasJob,
  basis: string,
  withDescription: boolean,
): JobResult {
  const loc = asArray(job.locationRestrictions).filter(Boolean)
  const tz = asArray(job.timezoneRestrictions).filter((n) => typeof n === "number")
  const levels = asArray(job.seniority).filter(Boolean)

  let salary: string | null = null
  if (job.minSalary || job.maxSalary) {
    salary = [job.minSalary, job.maxSalary].filter(Boolean).join("–")
    if (job.currency) salary += ` ${job.currency}`
    if (job.salaryPeriod) salary += `/${job.salaryPeriod}`
  }

  return {
    id: job.guid,
    title: (job.title ?? "").trim() || "(untitled)",
    company: (job.companyName ?? "").trim() || null,
    companySlug: job.companySlug ?? null,
    location: loc.length ? loc.join(", ") : "(unrestricted)",
    date: job.pubDate ? new Date(job.pubDate * 1000).toISOString() : null,
    url: job.applicationLink || `https://himalayas.app/jobs/${job.guid}`,
    level: levels.length ? levels.join(", ") : null,
    salary,
    locationRestrictions: loc,
    timezoneRestrictions: tz,
    locationBasis: basis,
    description: withDescription && job.description ? job.description : null,
  }
}

/** Case-insensitive OR match of any term against the title. */
export function titleMatches(title: string, terms: string[]): boolean {
  if (terms.length === 0) return true
  const t = title.toLowerCase()
  return terms.some((term) => t.includes(term))
}

/**
 * Default role vocabulary for this fork's search: senior systems-level People
 * roles. Kept here rather than in the caller so `--role-family hr` means the
 * same thing from /daily, /scrape and a manual run.
 */
export const HR_ROLE_TERMS = [
  "people partner", "people business partner", "hr business partner", "hrbp",
  "head of people", "head of hr", "director of people", "people director",
  "chief people", "vp people", "vp of people", "people operations", "people ops",
  "organizational development", "organisational development", "org design",
  "people systems", "people experience", "performance management",
  "talent management", "talent development", "hr transformation",
  "people analytics", "head of talent", "talent acquisition lead",
  "learning and development", "leadership development", "people lead",
  "hr director", "hr lead", "human resources business partner",
]

export function formatTable(results: JobResult[]): string {
  const rows = results.map((r) => [
    (r.date ?? "").slice(0, 10),
    r.title.slice(0, 42),
    (r.company ?? "").slice(0, 22),
    (r.location ?? "").slice(0, 24),
    (r.level ?? "").slice(0, 16),
    r.timezoneRestrictions.length ? r.timezoneRestrictions.join("/") : "-",
  ])
  const header = ["DATE", "TITLE", "COMPANY", "LOCATION", "LEVEL", "TZ"]
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ")
  return [line(header), ...rows.map(line)].join("\n")
}
