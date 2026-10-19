// Data source: the public job-board APIs of six ATS platforms — Ashby,
// Greenhouse, Lever, Workable, SmartRecruiters and Recruitee. Unlike
// aggregator/portal search (LinkedIn's guest endpoints, job boards), these
// return the employer's COMPLETE list of open roles with an exact publish
// timestamp, so a role is visible the moment it goes live and nothing is lost
// to search ranking.
//
// Company registry lives in ../../companies.json.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
export const REGISTRY_PATH = join(HERE, "..", "..", "companies.json")

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

/** Fetch JSON with exponential backoff on 429/5xx. Returns null on 404. */
export async function jsonFetch<T>(url: string): Promise<T | null> {
  const maxRetries = 4
  let delay = 400
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let response: Response
    try {
      response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      })
    } catch (e) {
      if (attempt === maxRetries) throw e
      await new Promise((r) => setTimeout(r, delay))
      delay = Math.min(delay * 2, 6000)
      continue
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 400)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 6000)
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

export interface Company {
  ats: "ashby" | "greenhouse" | "lever" | "workable" | "smartrecruiters" | "recruitee"
  slug: string
  name: string
  tags?: string[]
}

export function loadCompanies(): Company[] {
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as { companies: Company[] }
  return raw.companies
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

/** Normalized result honoring the portal-skill contract. */
export interface JobResult {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  ats: string
  remote: boolean | null
  ageHours: number | null
  department: string | null
  description: string | null
}

// ---------------------------------------------------------------- Ashby

interface AshbyJob {
  id: string
  title: string
  location: string
  secondaryLocations?: Array<{ location?: string }>
  publishedAt?: string
  isRemote?: boolean
  isListed?: boolean
  department?: string
  team?: string
  jobUrl: string
  applyUrl?: string
  descriptionPlain?: string
}

async function fetchAshby(c: Company): Promise<JobResult[]> {
  const d = await jsonFetch<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${c.slug}`,
  )
  if (!d?.jobs) return []
  return d.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const locs = [j.location, ...(j.secondaryLocations ?? []).map((s) => s?.location)]
        .filter(Boolean)
        .join(", ")
      return {
        id: `ashby:${c.slug}:${j.id}`,
        title: (j.title ?? "").trim() || "(untitled)",
        company: c.name,
        location: locs || null,
        date: j.publishedAt ?? null,
        url: j.applyUrl || j.jobUrl,
        ats: "ashby",
        remote: j.isRemote ?? null,
        ageHours: null,
        department: [j.department, j.team].filter(Boolean).join(" / ") || null,
        description: j.descriptionPlain ? j.descriptionPlain.trim() : null,
      }
    })
}

// ----------------------------------------------------------- Greenhouse

interface GreenhouseJob {
  id: number
  title: string
  location?: { name?: string }
  updated_at?: string
  first_published?: string
  absolute_url: string
  content?: string
  departments?: Array<{ name?: string }>
}

async function fetchGreenhouse(c: Company): Promise<JobResult[]> {
  const d = await jsonFetch<{ jobs: GreenhouseJob[] }>(
    `https://boards-api.greenhouse.io/v1/boards/${c.slug}/jobs`,
  )
  if (!d?.jobs) return []
  return d.jobs.map((j) => {
    const loc = j.location?.name ?? null
    return {
      id: `greenhouse:${c.slug}:${j.id}`,
      title: (j.title ?? "").trim() || "(untitled)",
      company: c.name,
      location: loc,
      // first_published is the true "went live" date; updated_at drifts on edits.
      date: j.first_published ?? j.updated_at ?? null,
      url: j.absolute_url,
      ats: "greenhouse",
      remote: loc ? /remote|home based|anywhere/i.test(loc) : null,
      ageHours: null,
      department: (j.departments ?? []).map((x) => x?.name).filter(Boolean).join(" / ") || null,
      description: null,
    }
  })
}

// ---------------------------------------------------------------- Lever

interface LeverJob {
  id: string
  text: string
  createdAt?: number
  hostedUrl: string
  applyUrl?: string
  descriptionPlain?: string
  categories?: { location?: string; team?: string; commitment?: string }
  workplaceType?: string
}

async function fetchLever(c: Company): Promise<JobResult[]> {
  const d = await jsonFetch<LeverJob[]>(`https://api.lever.co/v0/postings/${c.slug}?mode=json`)
  if (!Array.isArray(d)) return []
  return d.map((j) => ({
    id: `lever:${c.slug}:${j.id}`,
    title: (j.text ?? "").trim() || "(untitled)",
    company: c.name,
    location: j.categories?.location ?? null,
    date: j.createdAt ? new Date(j.createdAt).toISOString() : null,
    url: j.applyUrl || j.hostedUrl,
    ats: "lever",
    remote: j.workplaceType ? /remote/i.test(j.workplaceType) : null,
    ageHours: null,
    department: j.categories?.team ?? null,
    description: j.descriptionPlain ? j.descriptionPlain.trim() : null,
  }))
}

// -------------------------------------------------------------- Workable

interface WorkableJob {
  title: string
  shortcode: string
  department?: string | null
  application_url: string
  shortlink: string
  published_on?: string
  created_at?: string
  country?: string
  city?: string
  state?: string
  telecommuting?: boolean
}

async function fetchWorkable(c: Company): Promise<JobResult[]> {
  const d = await jsonFetch<{ name?: string; jobs: WorkableJob[] }>(
    `https://apply.workable.com/api/v1/widget/accounts/${c.slug}`,
  )
  if (!d?.jobs) return []
  return d.jobs.map((j) => {
    const loc = [j.city, j.state, j.country].filter(Boolean).join(", ") || null
    return {
      id: `workable:${c.slug}:${j.shortcode}`,
      title: (j.title ?? "").trim() || "(untitled)",
      company: c.name,
      location: loc,
      date: j.published_on ?? j.created_at ?? null,
      url: j.application_url || j.shortlink,
      ats: "workable",
      remote: j.telecommuting ?? null,
      ageHours: null,
      department: j.department ?? null,
      // Workable's public widget API carries no description field, and the
      // per-job page is a client-rendered SPA with nothing to scrape server-side.
      description: null,
    }
  })
}

// --------------------------------------------------------- SmartRecruiters

interface SmartRecruitersPosting {
  id: string
  name: string
  releasedDate?: string
  postingUrl?: string
  applyUrl?: string
  location?: { city?: string; region?: string; country?: string; remote?: boolean }
  department?: { label?: string }
  jobAd?: { sections?: Record<string, { title?: string; text?: string }> }
}

async function fetchSmartRecruiters(c: Company): Promise<JobResult[]> {
  const d = await jsonFetch<{ content: SmartRecruitersPosting[] }>(
    `https://api.smartrecruiters.com/v1/companies/${c.slug}/postings?limit=100`,
  )
  if (!d?.content) return []
  return d.content.map((j) => {
    const loc = [j.location?.city, j.location?.region, j.location?.country]
      .filter(Boolean)
      .join(", ") || null
    return {
      id: `smartrecruiters:${c.slug}:${j.id}`,
      title: (j.name ?? "").trim() || "(untitled)",
      company: c.name,
      location: loc,
      date: j.releasedDate ?? null,
      url: j.applyUrl || j.postingUrl || "",
      ats: "smartrecruiters",
      remote: j.location?.remote ?? null,
      ageHours: null,
      department: j.department?.label ?? null,
      description: null,
    }
  })
}

function smartRecruitersDescription(sections?: Record<string, { text?: string }>): string | null {
  if (!sections) return null
  const text = Object.values(sections)
    .map((s) => s.text)
    .filter(Boolean)
    .join("\n\n")
  return text ? htmlToText(decodeHtmlEntities(text)) : null
}

// ------------------------------------------------------------- Recruitee

interface RecruiteeOffer {
  id: number
  title: string
  slug?: string
  status?: string
  published_at?: string
  created_at?: string
  careers_url?: string
  careers_apply_url?: string
  department?: string | null
  remote?: boolean
  city?: string | null
  country?: string | null
  location?: string | null
  locations?: Array<{ city?: string | null; country?: string | null }>
  description?: string | null
  requirements?: string | null
}

/**
 * Recruitee stamps dates as "2026-08-31 14:45:48 UTC", not ISO 8601. V8 and
 * JSC both happen to parse that, but normalizing here keeps the `--hours`
 * filter from depending on engine-specific date leniency — an unparsed date
 * would silently demote a fresh role to "unknown age" and sort it last.
 */
function recruiteeDate(raw?: string): string | null {
  if (!raw) return null
  const t = Date.parse(raw.trim().replace(" UTC", "Z").replace(" ", "T"))
  return isNaN(t) ? null : new Date(t).toISOString()
}

/**
 * Join every entry of `locations[]` as "City, Country", deduped. This array is
 * where EU eligibility hides, exactly like Ashby's `secondaryLocations`: a
 * remote role can read `location: "Remote job"` at the top level while
 * `locations[]` carries the actual list of eligible countries. Never judge
 * geography from the top-level field, which is only a display string.
 */
function recruiteeLocation(j: RecruiteeOffer): string | null {
  const parts = (j.locations ?? []).map((l) => {
    const city = (l?.city ?? "").trim()
    const country = (l?.country ?? "").trim()
    // Recruitee boards often set city === country for country-wide postings.
    return city && country && city !== country ? `${city}, ${country}` : country || city
  })
  const unique = [...new Set(parts.filter(Boolean))]
  if (unique.length) return unique.join("; ")
  return [j.city, j.country].filter(Boolean).join(", ") || j.location || null
}

async function fetchRecruitee(c: Company): Promise<JobResult[]> {
  const d = await jsonFetch<{ offers: RecruiteeOffer[] }>(
    `https://${c.slug}.recruitee.com/api/offers/`,
  )
  if (!d?.offers) return []
  return d.offers
    .filter((j) => !j.status || j.status === "published")
    .map((j) => {
      const body = [j.description, j.requirements].filter(Boolean).join("\n\n")
      return {
        id: `recruitee:${c.slug}:${j.id}`,
        title: (j.title ?? "").trim() || "(untitled)",
        company: c.name,
        location: recruiteeLocation(j),
        date: recruiteeDate(j.published_at) ?? recruiteeDate(j.created_at),
        // careers_url (the posting page) is preferred over careers_apply_url,
        // which is a bare application form carrying none of the posting text —
        // /daily reads the body to verify the location and timezone gates.
        url: j.careers_url || j.careers_apply_url || "",
        ats: "recruitee",
        remote: j.remote ?? null,
        ageHours: null,
        department: j.department ?? null,
        // Both fields are HTML; `requirements` is a separate list, not a
        // duplicate of `description`, so the two are concatenated.
        description: body ? htmlToText(body) : null,
      }
    })
}

/** Poll one company's board. Never throws: a failing board yields []. */
export async function fetchCompany(
  c: Company,
): Promise<{ results: JobResult[]; error: string | null }> {
  try {
    let results: JobResult[]
    if (c.ats === "ashby") results = await fetchAshby(c)
    else if (c.ats === "greenhouse") results = await fetchGreenhouse(c)
    else if (c.ats === "lever") results = await fetchLever(c)
    else if (c.ats === "workable") results = await fetchWorkable(c)
    else if (c.ats === "smartrecruiters") results = await fetchSmartRecruiters(c)
    else if (c.ats === "recruitee") results = await fetchRecruitee(c)
    else return { results: [], error: `unknown ats "${c.ats}"` }
    return { results, error: null }
  } catch (e) {
    return { results: [], error: e instanceof Error ? e.message : String(e) }
  }
}

/** Fetch one job's full description (Greenhouse only; others carry it inline). */
export async function fetchDetail(id: string): Promise<JobResult | null> {
  const [ats, slug, jobId] = id.split(":")
  const companies = loadCompanies()
  const c = companies.find((x) => x.ats === ats && x.slug === slug)
  if (!c) return null

  if (ats === "greenhouse") {
    const j = await jsonFetch<GreenhouseJob>(
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`,
    )
    if (!j) return null
    const loc = j.location?.name ?? null
    return {
      id,
      title: j.title,
      company: c.name,
      location: loc,
      date: j.first_published ?? j.updated_at ?? null,
      url: j.absolute_url,
      ats,
      remote: loc ? /remote|home based|anywhere/i.test(loc) : null,
      ageHours: null,
      department: (j.departments ?? []).map((x) => x?.name).filter(Boolean).join(" / ") || null,
      description: j.content ? htmlToText(decodeHtmlEntities(j.content)) : null,
    }
  }

  if (ats === "smartrecruiters") {
    const j = await jsonFetch<SmartRecruitersPosting>(
      `https://api.smartrecruiters.com/v1/companies/${slug}/postings/${jobId}`,
    )
    if (!j) return null
    const loc = [j.location?.city, j.location?.region, j.location?.country]
      .filter(Boolean)
      .join(", ") || null
    return {
      id,
      title: j.name,
      company: c.name,
      location: loc,
      date: j.releasedDate ?? null,
      url: j.applyUrl || j.postingUrl || "",
      ats,
      remote: j.location?.remote ?? null,
      ageHours: null,
      department: j.department?.label ?? null,
      description: smartRecruitersDescription(j.jobAd?.sections),
    }
  }

  const { results } = await fetchCompany(c)
  return results.find((r) => r.id === id) ?? null
}

// ------------------------------------------------------------- filtering

/**
 * Role-family keyword sets. `people` is the default for this fork: it is
 * deliberately broad on the People/HR side and relies on EXCLUDE to drop
 * the engineering roles that share vocabulary ("talent" in recruiting-tech
 * product names, "people" in unrelated titles).
 */
export const FAMILIES: Record<string, { include: RegExp; exclude?: RegExp }> = {
  people: {
    include:
      /\b(people|hr|human resources|hrbp|talent|organiza[ts]ional|org development|learning and development|l&d|culture|employee|workforce|compensation|total rewards|performance management|coach(ing)?|enablement|onboarding|recruit(er|ing|ment)|chief of staff|transformation|change management|ways of working|operating model|agile|organi[sz]ational effectiveness|performance (partner|manager|lead)|org(anisation|anization)? design(er)?|operating rhythm)\b/i,
    // "learning" collides with ML titles, and several engineering/GTM titles
    // legitimately contain "people"/"talent" — drop those explicitly.
    exclude:
      /\b(machine|deep|reinforcement|federated) learning\b|\b(engineer|developer|scientist|architect|sales|account executive|marketing|designer|sdr|bdr|solutions consultant|support|technical writer|product manager|program manager, (machine|ml|ai)|cyber|order-to-cash|quote-to-cash|working capital|finance transformation|digital transformation consultant|payroll|benefits (administrator|specialist|coordinator)|hris (administrator|analyst|specialist)|(people|hr) operations (specialist|coordinator|associate|assistant|administrator)|hr (coordinator|assistant|administrator|generalist))\b/i,
  },
  all: { include: /.*/ },
}

export function ageHours(dateStr: string | null): number | null {
  if (!dateStr) return null
  const t = Date.parse(dateStr)
  if (isNaN(t)) return null
  return (Date.now() - t) / 3_600_000
}

export function formatTable(results: JobResult[]): string {
  const rows = results.map((r) => [
    r.ageHours === null ? "?" : r.ageHours < 48 ? `${Math.round(r.ageHours)}h` : `${Math.round(r.ageHours / 24)}d`,
    r.title.slice(0, 46),
    (r.company ?? "").slice(0, 16),
    (r.location ?? "").slice(0, 34),
    (r.date ?? "").slice(0, 10),
  ])
  const header = ["AGE", "TITLE", "COMPANY", "LOCATION", "PUBLISHED"]
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)))
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ")
  return [line(header), ...rows.map(line)].join("\n")
}
