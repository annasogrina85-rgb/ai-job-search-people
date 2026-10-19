// Data source: Jobicy's public API (https://jobicy.com/api/v2/remote-jobs).
// JSON, no authentication. Server-side filters: geo, industry, tag (keyword).
// The feed returns full descriptions inline. There is no by-id endpoint:
// `detail` re-fetches the feed and picks the job out of it.

export const API_URL = "https://jobicy.com/api/v2/remote-jobs"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on a 404. */
export async function jsonFetch<T>(url: string): Promise<T | null> {
  const maxRetries = 6
  let delay = 500
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
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
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

/** Raw job shape from the Jobicy feed. */
export interface JobicyJob {
  id: number
  url: string
  jobSlug: string
  jobTitle: string
  companyName: string
  jobIndustry: string[] | string
  jobType: string[] | string
  jobGeo: string
  jobLevel: string
  jobExcerpt: string
  jobDescription: string
  pubDate: string
  annualSalaryMin?: number | string
  annualSalaryMax?: number | string
  salaryCurrency?: string
}

export interface FeedResponse {
  jobCount: number
  jobs: JobicyJob[]
}

/** Normalized result honoring the portal-skill contract. */
export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  level: string | null
  industry: string | null
  jobType: string | null
  salary: string | null
  description: string | null
}

function joinField(v: string[] | string | undefined): string | null {
  if (!v) return null
  const s = Array.isArray(v) ? v.join(", ") : v
  return decodeHtmlEntities(s).trim() || null
}

export function normalizeJob(job: JobicyJob, withDescription: boolean): JobResult {
  let salary: string | null = null
  if (job.annualSalaryMin || job.annualSalaryMax) {
    salary = [job.annualSalaryMin, job.annualSalaryMax].filter(Boolean).join("–")
    if (job.salaryCurrency) salary += ` ${job.salaryCurrency}`
  }
  return {
    id: String(job.id),
    title: decodeHtmlEntities(job.jobTitle ?? "").trim() || "(untitled)",
    company: decodeHtmlEntities(job.companyName ?? "").trim() || null,
    location: decodeHtmlEntities(job.jobGeo ?? "").trim() || null,
    date: job.pubDate || null,
    url: job.url || `https://jobicy.com/jobs/${job.jobSlug}`,
    level: decodeHtmlEntities(job.jobLevel ?? "").trim() || null,
    industry: joinField(job.jobIndustry),
    jobType: joinField(job.jobType),
    salary,
    description: withDescription && job.jobDescription ? htmlToText(job.jobDescription) : null,
  }
}

/** Client-side posting-age filter (the API has no date parameter). */
export function withinJobage(dateStr: string | null, days: number): boolean {
  if (!days || days <= 0 || days >= 9999) return true
  if (!dateStr) return true
  const posted = Date.parse(dateStr)
  if (isNaN(posted)) return true
  return Date.now() - posted <= days * 86400_000
}

export function formatTable(results: JobResult[]): string {
  const rows = results.map((r) => [
    r.id,
    r.title.slice(0, 44),
    (r.company ?? "").slice(0, 24),
    (r.location ?? "").slice(0, 18),
    (r.level ?? "").slice(0, 18),
    (r.date ?? "").slice(0, 10),
  ])
  const header = ["ID", "TITLE", "COMPANY", "GEO", "LEVEL", "DATE"]
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ")
  return [line(header), ...rows.map(line)].join("\n")
}
