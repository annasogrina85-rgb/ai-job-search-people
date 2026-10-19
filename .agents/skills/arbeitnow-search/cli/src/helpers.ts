// Data source: Arbeitnow's public job-board API
// (https://www.arbeitnow.com/api/job-board-api). JSON, no authentication,
// paginated at 175 jobs/page, newest first. Europe-centric (Germany-heavy).
// No server-side search — the CLI fetches recent pages and filters client-side.

export const API_URL = "https://www.arbeitnow.com/api/job-board-api"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/**
 * Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404.
 *
 * Arbeitnow rate-limits at 50 requests (x-ratelimit-limit) per window and one
 * search walks up to MAX_FEED_PAGES pages, so several CLI invocations running
 * concurrently — which is how the daily sweep calls this — can trip the limit
 * together. Three things matter for recovering from that rather than failing
 * the whole source (observed 2026-08-21: two of six concurrent queries died on
 * 429 despite backoff already being in place):
 *
 *  1. Honour Retry-After when the server sends it. Guessing a delay when we
 *     have been told one is how a retry lands on a still-closed window.
 *  2. Wait long enough. The limit is per-window, so the cap has to be on the
 *     order of a window (60s), not 8s — the old ceiling gave up while the
 *     window was still open.
 *  3. Jitter, but keep a floor. Concurrent callers that back off on the same
 *     schedule retry in lockstep and collide again, so the delay is randomised
 *     - but only its upper half, so a run of unlucky draws cannot collapse the
 *     wait to nothing and exhaust the retries early.
 */
export async function jsonFetch<T>(url: string): Promise<T | null> {
  const maxRetries = 6
  const baseDelay = 500
  const maxDelay = 60_000
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      await new Promise((r) => setTimeout(r, retryDelayMs(response, attempt, baseDelay, maxDelay)))
      continue
    }
    if (response.status === 404) return null
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return (await response.json()) as T
  }
  throw new Error("Request failed after max retries")
}

/**
 * How long to wait before retrying: the server's Retry-After when present
 * (seconds, or an HTTP-date), otherwise exponential backoff with full jitter.
 * Exported for tests.
 */
export function retryDelayMs(
  response: { headers: { get(name: string): string | null } },
  attempt: number,
  baseDelay = 500,
  maxDelay = 60_000,
  random: () => number = Math.random,
): number {
  const header = response.headers.get("retry-after")
  if (header) {
    const seconds = Number(header.trim())
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, maxDelay)
    }
    const at = Date.parse(header)
    if (!Number.isNaN(at)) {
      return Math.min(Math.max(at - Date.now(), 0), maxDelay)
    }
  }
  // Equal jitter: half the ceiling as a floor, plus a random half on top.
  // Full jitter ([0, ceiling]) decorrelates better but can return ~0, which
  // lets all six retries burn through in milliseconds and fail while the rate
  // window is still shut - observed 2026-08-21, when it made six concurrent
  // queries fail *faster* than the fixed-tail backoff it replaced. Keeping a
  // floor preserves the wait; the random half still spreads concurrent callers.
  const ceiling = Math.min(baseDelay * 2 ** attempt, maxDelay)
  const half = ceiling / 2
  return Math.floor(half + random() * half)
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

/** HTML description -> readable text with paragraph breaks preserved. */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
  return decodeHtmlEntities(withBreaks.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Raw job shape from the Arbeitnow feed. */
export interface ArbeitnowJob {
  slug: string
  company_name: string
  title: string
  description: string
  remote: boolean
  url: string
  tags: string[]
  job_types: string[]
  location: string
  created_at: number
}

export interface FeedResponse {
  data: ArbeitnowJob[]
  links: { next?: string | null }
  meta: { current_page: number }
}

/** Normalized result honoring the portal-skill contract. */
export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  remote: boolean
  tags: string[]
  jobTypes: string[]
  description: string | null
}

export function normalizeJob(job: ArbeitnowJob, withDescription: boolean): JobResult {
  return {
    id: job.slug,
    title: decodeHtmlEntities(job.title ?? "").trim() || "(untitled)",
    company: decodeHtmlEntities(job.company_name ?? "").trim() || null,
    location: decodeHtmlEntities(job.location ?? "").trim() || null,
    date: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
    url: job.url || `https://www.arbeitnow.com/jobs/${job.slug}`,
    remote: Boolean(job.remote),
    tags: Array.isArray(job.tags) ? job.tags : [],
    jobTypes: Array.isArray(job.job_types) ? job.job_types : [],
    description: withDescription && job.description ? htmlToText(job.description) : null,
  }
}

/**
 * Case-insensitive multi-term match over title/company/location/tags/description.
 * Terms match on word boundaries, so a short query like "hr" cannot match
 * inside unrelated words (German "Uhr", "through", …).
 */
export function matchesQuery(job: ArbeitnowJob, query: string): boolean {
  const haystack = [
    job.title,
    job.company_name,
    job.location,
    (job.tags ?? []).join(" "),
    job.description,
  ].join(" ")
  return query
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(haystack)
    })
}

export function withinJobage(createdAt: number, days: number): boolean {
  if (!days || days <= 0 || days >= 9999) return true
  if (!createdAt) return true
  return Date.now() - createdAt * 1000 <= days * 86400_000
}

export function formatTable(results: JobResult[]): string {
  const rows = results.map((r) => [
    r.id.slice(0, 46),
    r.title.slice(0, 40),
    (r.company ?? "").slice(0, 22),
    (r.location ?? "").slice(0, 16),
    r.remote ? "remote" : "onsite",
    (r.date ?? "").slice(0, 10),
  ])
  const header = ["ID", "TITLE", "COMPANY", "LOCATION", "MODE", "DATE"]
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ")
  return [line(header), ...rows.map(line)].join("\n")
}
