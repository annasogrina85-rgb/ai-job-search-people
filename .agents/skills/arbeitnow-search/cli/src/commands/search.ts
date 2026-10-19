import {
  API_URL,
  jsonFetch,
  writeError,
  normalizeJob,
  matchesQuery,
  withinJobage,
  formatTable,
  type FeedResponse,
  type ArbeitnowJob,
  type JobResult,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  remote?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

// The feed is newest-first at 175 jobs/page; 4 pages ≈ 700 recent postings is
// a reasonable politeness/coverage trade-off for one search command.
const MAX_FEED_PAGES = 4

export async function runSearch(opts: SearchOpts): Promise<number> {
  let remoteFilter: boolean | undefined
  if (opts.remote !== undefined) {
    const mode = opts.remote.toLowerCase()
    if (mode === "remote") remoteFilter = true
    else if (mode === "onsite" || mode === "on-site") remoteFilter = false
    else {
      writeError(
        `--remote must be "remote" or "onsite" (Arbeitnow has no hybrid flag), got "${opts.remote}"`,
        "BAD_ARG",
      )
      return 1
    }
  }

  // The feed is *mostly* newest-first, but pinned/featured postings can appear
  // at any position with much older created_at values (observed 2026-08-18: the
  // first item in the feed was ~6 days old while items 2-5 were an hour old).
  // A hard stop at the first out-of-window job therefore returns 0 results on
  // days with a pinned posting up top. Instead, skip out-of-window jobs and
  // only stop once a long consecutive run of them shows we are genuinely past
  // the recent window.
  const STOP_AFTER_CONSECUTIVE_OLD = 15
  const matched: ArbeitnowJob[] = []
  let consecutiveOld = 0
  let stopEarly = false
  for (let feedPage = 1; feedPage <= MAX_FEED_PAGES && !stopEarly; feedPage++) {
    let feed: FeedResponse | null
    try {
      feed = await jsonFetch<FeedResponse>(`${API_URL}?page=${feedPage}`)
    } catch (e) {
      writeError(e instanceof Error ? e.message : String(e), "FETCH_FAILED")
      return 1
    }
    if (!feed || !Array.isArray(feed.data)) {
      writeError("Arbeitnow API returned no job list (unexpected response shape)", "BAD_RESPONSE")
      return 1
    }
    for (const job of feed.data) {
      if (!withinJobage(job.created_at, opts.jobage)) {
        consecutiveOld++
        if (consecutiveOld >= STOP_AFTER_CONSECUTIVE_OLD) {
          stopEarly = true
          break
        }
        continue
      }
      consecutiveOld = 0
      if (remoteFilter !== undefined && Boolean(job.remote) !== remoteFilter) continue
      if (opts.query && !matchesQuery(job, opts.query)) continue
      matched.push(job)
    }
    if (!feed.links?.next) break
  }

  const wantDescription = opts.format === "json"
  let results: JobResult[] = matched.map((j) => normalizeJob(j, wantDescription))

  const total = results.length
  const pageSize = opts.limit ?? 25
  const start = (opts.page - 1) * pageSize
  results = results.slice(start, start + pageSize)

  if (opts.format === "table" || opts.format === "plain") {
    process.stdout.write(formatTable(results) + "\n")
    return 0
  }
  process.stdout.write(
    JSON.stringify(
      { meta: { count: results.length, page: opts.page, total }, results },
      null,
      2,
    ) + "\n",
  )
  return 0
}
