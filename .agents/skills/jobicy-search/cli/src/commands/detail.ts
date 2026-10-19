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

/**
 * Accepts a numeric id, a job slug (leading digits), or a jobicy.com job URL
 * (slug's leading digits are the id).
 */
function parseId(input: string): string | null {
  if (/^\d+$/.test(input)) return input
  const m = input.match(/jobs\/(\d+)/) || input.match(/^(\d+)-/)
  return m ? m[1] : null
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = parseId(opts.id)
  if (!id) {
    writeError(`Could not parse a Jobicy job id from "${opts.id}"`, "BAD_ID")
    return 1
  }

  // No by-id endpoint exists; fetch the newest feed window and pick the job out.
  let feed: FeedResponse | null
  try {
    feed = await jsonFetch<FeedResponse>(`${API_URL}?count=50`)
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "FETCH_FAILED")
    return 1
  }
  const raw = feed?.jobs?.find((j) => String(j.id) === id)
  if (!raw) {
    writeError(
      `Job ${id} is not in the current Jobicy feed window (the API only serves the newest 50 postings per query; older jobs must be read from their URL)`,
      "JOB_NOT_FOUND",
    )
    return 1
  }

  const job = normalizeJob(raw, true)
  if (opts.format === "plain") {
    const lines = [
      `${job.title} — ${job.company ?? "(unknown company)"}`,
      `Geo: ${job.location ?? "-"} | Level: ${job.level ?? "-"} | Type: ${job.jobType ?? "-"}`,
      `Industry: ${job.industry ?? "-"} | Salary: ${job.salary ?? "-"} | Posted: ${job.date ?? "-"}`,
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
