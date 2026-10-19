import {
  API_URL,
  jsonFetch,
  writeError,
  normalizeJob,
  classifyLocation,
  timezoneCompatible,
  titleMatches,
  formatTable,
  HR_ROLE_TERMS,
  type FeedResponse,
  type JobResult,
} from "../helpers.js"

export interface SearchOpts {
  /** Recency window; paging stops as soon as the feed falls out of it. */
  hours: number
  /** Comma-separated title keywords (OR). Empty = no title filter. */
  query?: string
  /** Expand to a built-in vocabulary instead of hand-writing --query. */
  roleFamily?: string
  scope: "eligible" | "eu" | "any"
  homeCountry: string
  /** Inclusive UTC-offset band the candidate can work. */
  tzMin: number
  tzMax: number
  applyTz: boolean
  minSalary?: number
  seniority?: string
  maxPages: number
  limit?: number
  format: "json" | "table" | "plain"
}

interface Counters {
  scanned: number
  pagesFetched: number
  droppedTitle: number
  droppedLocation: number
  droppedTimezone: number
  droppedSeniority: number
  droppedSalary: number
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const cutoffMs = Date.now() - opts.hours * 3600_000

  const terms =
    opts.roleFamily === "hr"
      ? HR_ROLE_TERMS
      : (opts.query ?? "")
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)

  const wantedLevels = (opts.seniority ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)

  const c: Counters = {
    scanned: 0,
    pagesFetched: 0,
    droppedTitle: 0,
    droppedLocation: 0,
    droppedTimezone: 0,
    droppedSeniority: 0,
    droppedSalary: 0,
  }

  const kept: JobResult[] = []
  const wantDescription = opts.format === "json"
  let cursor: string | null = null
  let reachedCutoff = false
  let truncated = false

  for (let page = 0; page < opts.maxPages; page++) {
    const url: string = cursor
      ? `${API_URL}?limit=20&cursor=${encodeURIComponent(cursor)}`
      : `${API_URL}?limit=20`

    let feed: FeedResponse | null
    try {
      feed = await jsonFetch<FeedResponse>(url)
    } catch (e) {
      // Partial coverage is reported, never hidden: emit what we have plus the
      // error, so a mid-page failure degrades the run instead of aborting it.
      writeError(
        `${e instanceof Error ? e.message : String(e)} (after ${c.pagesFetched} pages)`,
        "FETCH_FAILED",
      )
      truncated = true
      break
    }
    if (!feed || !Array.isArray(feed.jobs) || feed.jobs.length === 0) break
    c.pagesFetched++

    for (const job of feed.jobs) {
      const postedMs = (job.pubDate ?? 0) * 1000
      if (postedMs && postedMs < cutoffMs) {
        reachedCutoff = true
        continue
      }
      c.scanned++

      if (!titleMatches(job.title ?? "", terms)) {
        c.droppedTitle++
        continue
      }

      const loc = (job.locationRestrictions ?? []).filter(Boolean)
      const { keep, basis } = classifyLocation(loc, opts.homeCountry, opts.scope)
      if (!keep) {
        c.droppedLocation++
        continue
      }

      const tz = (job.timezoneRestrictions ?? []).filter((n) => typeof n === "number")
      if (opts.applyTz && !timezoneCompatible(tz, opts.tzMin, opts.tzMax)) {
        c.droppedTimezone++
        continue
      }

      if (wantedLevels.length) {
        const levels = (Array.isArray(job.seniority) ? job.seniority : [job.seniority])
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
        if (levels.length && !levels.some((l) => wantedLevels.includes(l))) {
          c.droppedSeniority++
          continue
        }
      }

      if (opts.minSalary && job.maxSalary && job.maxSalary < opts.minSalary) {
        c.droppedSalary++
        continue
      }

      kept.push(normalizeJob(job, basis, wantDescription))
    }

    if (reachedCutoff) break
    cursor = feed.nextCursor
    if (!cursor) break
    if (page === opts.maxPages - 1) truncated = true
  }

  const total = kept.length
  const results = opts.limit ? kept.slice(0, opts.limit) : kept

  if (opts.format === "table" || opts.format === "plain") {
    process.stdout.write(
      (results.length ? formatTable(results) : "(no matches)") +
        `\n\n${total} match(es) from ${c.scanned} postings in the last ${opts.hours}h ` +
        `(${c.pagesFetched} pages).\n`,
    )
    return 0
  }

  process.stdout.write(
    JSON.stringify(
      {
        meta: {
          count: results.length,
          total,
          hours: opts.hours,
          scope: opts.scope,
          homeCountry: opts.homeCountry,
          scanned: c.scanned,
          pagesFetched: c.pagesFetched,
          reachedCutoff,
          // True when paging stopped on --max-pages or a fetch error rather than
          // on the date cutoff: the window is then only partly covered.
          truncated,
          dropped: {
            title: c.droppedTitle,
            location: c.droppedLocation,
            timezone: c.droppedTimezone,
            seniority: c.droppedSeniority,
            salary: c.droppedSalary,
          },
        },
        results,
      },
      null,
      2,
    ) + "\n",
  )
  return 0
}
