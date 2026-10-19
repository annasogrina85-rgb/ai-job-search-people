import { fetchDetail, ageHours, writeError } from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  if (!/^(ashby|greenhouse|lever|workable|smartrecruiters|recruitee):[^:]+:.+$/.test(opts.id)) {
    writeError(
      `id must look like "<ats>:<company-slug>:<job-id>" (as returned by search), got "${opts.id}"`,
      "BAD_ID",
    )
    return 1
  }

  let job
  try {
    job = await fetchDetail(opts.id)
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "FETCH_FAILED")
    return 1
  }
  if (!job) {
    writeError(
      `job ${opts.id} not found on its board (likely closed, or the company is not in companies.json)`,
      "JOB_NOT_FOUND",
    )
    return 1
  }

  job.ageHours = ageHours(job.date)

  if (opts.format === "plain") {
    const lines = [
      `${job.title} — ${job.company ?? "(unknown company)"}`,
      `Location: ${job.location ?? "-"} | Remote: ${job.remote === null ? "?" : job.remote} | Dept: ${job.department ?? "-"}`,
      `Published: ${job.date ?? "-"}${job.ageHours !== null ? ` (${Math.round(job.ageHours)}h ago)` : ""}`,
      `Apply: ${job.url}`,
      "",
      job.description ?? "(no description)",
    ]
    process.stdout.write(lines.join("\n") + "\n")
    return 0
  }
  process.stdout.write(JSON.stringify(job, null, 2) + "\n")
  return 0
}
