import {
  API_URL,
  jsonFetch,
  writeError,
  normalizeJob,
  withinJobage,
  formatTable,
  type FeedResponse,
  type JobResult,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  geo?: string
  industry?: string
  jobage: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  const params = new URLSearchParams()
  // Always request the API maximum (50); paging/limits are applied client-side.
  params.set("count", "50")
  if (opts.query) params.set("tag", opts.query)
  if (opts.geo) params.set("geo", opts.geo)
  if (opts.industry) params.set("industry", opts.industry)

  let feed: FeedResponse | null
  try {
    feed = await jsonFetch<FeedResponse>(`${API_URL}?${params}`)
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "FETCH_FAILED")
    return 1
  }
  if (!feed || !Array.isArray(feed.jobs)) {
    writeError("Jobicy API returned no job list (unexpected response shape)", "BAD_RESPONSE")
    return 1
  }

  const wantDescription = opts.format === "json"
  let results: JobResult[] = feed.jobs.map((j) => normalizeJob(j, wantDescription))
  results = results.filter((r) => withinJobage(r.date, opts.jobage))

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
