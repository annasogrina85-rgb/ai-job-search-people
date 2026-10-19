import {
  loadCompanies,
  fetchCompany,
  ageHours,
  formatTable,
  writeError,
  FAMILIES,
  type JobResult,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  family: string
  maxAgeHours?: number
  remoteOnly: boolean
  company?: string
  page: number
  limit?: number
  format: "json" | "table" | "plain"
  withDescription: boolean
}

/** Boards are polled in parallel, capped so we stay polite to each ATS. */
const CONCURRENCY = 8

export async function runSearch(opts: SearchOpts): Promise<number> {
  const family = FAMILIES[opts.family]
  if (!family) {
    writeError(
      `unknown --family "${opts.family}" (known: ${Object.keys(FAMILIES).join(", ")})`,
      "BAD_ARG",
    )
    return 1
  }

  let companies = loadCompanies()
  if (opts.company) {
    const needle = opts.company.toLowerCase()
    companies = companies.filter(
      (c) => c.slug.toLowerCase() === needle || c.name.toLowerCase().includes(needle),
    )
    if (companies.length === 0) {
      writeError(`no company in companies.json matches "${opts.company}"`, "NO_COMPANY")
      return 1
    }
  }

  const pool: JobResult[] = []
  const boardErrors: Array<{ company: string; error: string }> = []
  for (let i = 0; i < companies.length; i += CONCURRENCY) {
    const batch = companies.slice(i, i + CONCURRENCY)
    const settled = await Promise.all(batch.map((c) => fetchCompany(c)))
    settled.forEach((r, idx) => {
      if (r.error) boardErrors.push({ company: batch[idx].name, error: r.error })
      pool.push(...r.results)
    })
  }

  let results = pool.map((r) => ({ ...r, ageHours: ageHours(r.date) }))

  results = results.filter((r) => {
    if (!family.include.test(r.title)) return false
    if (family.exclude && family.exclude.test(r.title)) return false
    return true
  })

  if (opts.query) {
    const terms = opts.query.toLowerCase().split(/\s+/).filter(Boolean)
    results = results.filter((r) => {
      const hay = [r.title, r.company, r.location, r.department, r.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
      return terms.every((t) => hay.includes(t))
    })
  }

  if (opts.maxAgeHours !== undefined) {
    // An unknown publish date is kept (never silently dropped) but sorts last.
    results = results.filter((r) => r.ageHours === null || r.ageHours <= opts.maxAgeHours!)
  }

  if (opts.remoteOnly) {
    results = results.filter(
      (r) =>
        r.remote === true ||
        /remote|anywhere|home based|emea|europe|distributed/i.test(r.location ?? ""),
    )
  }

  results.sort((a, b) => {
    if (a.ageHours === null) return 1
    if (b.ageHours === null) return -1
    return a.ageHours - b.ageHours
  })

  if (!opts.withDescription || opts.format !== "json") {
    results = results.map((r) => ({ ...r, description: null }))
  }

  const total = results.length
  const pageSize = opts.limit ?? 40
  const start = (opts.page - 1) * pageSize
  const paged = results.slice(start, start + pageSize)

  if (opts.format === "table" || opts.format === "plain") {
    process.stdout.write(formatTable(paged) + "\n")
    if (boardErrors.length) {
      process.stderr.write(
        `note: ${boardErrors.length} board(s) unreachable: ${boardErrors
          .map((e) => e.company)
          .join(", ")}\n`,
      )
    }
    return 0
  }

  process.stdout.write(
    JSON.stringify(
      {
        meta: {
          count: paged.length,
          page: opts.page,
          total,
          companiesPolled: companies.length,
          boardErrors,
        },
        results: paged,
      },
      null,
      2,
    ) + "\n",
  )
  return 0
}
