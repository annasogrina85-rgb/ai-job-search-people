import {
  API_URL,
  jsonFetch,
  writeError,
  normalizeJob,
  type FeedResponse,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

/** Accepts a slug or an arbeitnow.com job URL (slug is the last path segment). */
function parseSlug(input: string): string | null {
  if (!input.includes("/")) return input
  const m = input.match(/\/jobs\/(?:companies\/[^/]+\/)?([^/?#]+)/)
  return m ? m[1] : null
}

// The feed has no by-slug endpoint; scan recent pages for the slug.
const MAX_FEED_PAGES = 8

export async function runDetail(opts: DetailOpts): Promise<number> {
  const slug = parseSlug(opts.id)
  if (!slug) {
    writeError(`Could not parse an Arbeitnow job slug from "${opts.id}"`, "BAD_ID")
    return 1
  }

  for (let feedPage = 1; feedPage <= MAX_FEED_PAGES; feedPage++) {
    let feed: FeedResponse | null
    try {
      feed = await jsonFetch<FeedResponse>(`${API_URL}?page=${feedPage}`)
    } catch (e) {
      writeError(e instanceof Error ? e.message : String(e), "FETCH_FAILED")
      return 1
    }
    if (!feed || !Array.isArray(feed.data)) break

    const raw = feed.data.find((j) => j.slug === slug)
    if (raw) {
      const job = normalizeJob(raw, true)
      if (opts.format === "plain") {
        const lines = [
          `${job.title} — ${job.company ?? "(unknown company)"}`,
          `Location: ${job.location ?? "-"} | Mode: ${job.remote ? "remote" : "onsite"} | Types: ${job.jobTypes.join(", ") || "-"}`,
          `Tags: ${job.tags.join(", ") || "-"} | Posted: ${job.date ?? "-"}`,
          `URL: ${job.url}`,
          "",
          job.description ?? "(no description)",
        ]
        process.stdout.write(lines.join("\n") + "\n")
        return 0
      }
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
      return 0
    }
    if (!feed.links?.next) break
  }

  writeError(
    `Job "${slug}" was not found in the newest ${MAX_FEED_PAGES} feed pages (likely expired); read its public URL instead`,
    "JOB_NOT_FOUND",
  )
  return 1
}
