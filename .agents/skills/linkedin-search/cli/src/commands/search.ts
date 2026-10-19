import {
  SEARCH_URL,
  htmlFetch,
  parseJobCards,
  jobageToTPR,
  workTypeFlag,
  writeError,
  classifyLocationScope,
  REMOTE_CANDIDATE_SCOPES,
  type JobCard,
  type LocationScope,
} from "../helpers.js"

/** A search card plus the location-scope triage signal derived from it. */
type TriagedCard = JobCard & { locationScope: LocationScope }

export interface SearchOpts {
  query?: string
  location: string
  jobage: number
  remote?: string // "remote" | "hybrid" | "onsite"
  page: number
  limit?: number
  triageRemote?: boolean
  format: "json" | "table" | "plain"
}

function buildUrl(opts: SearchOpts): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("keywords", opts.query)
  if (opts.location) params.set("location", opts.location)
  const tpr = jobageToTPR(opts.jobage)
  if (tpr) params.set("f_TPR", tpr)
  const wt = workTypeFlag(opts.remote)
  if (wt) params.set("f_WT", wt)
  params.set("start", String((opts.page - 1) * 10))
  return `${SEARCH_URL}?${params.toString()}`
}

function renderTable(cards: TriagedCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 42).padEnd(42)
    const company = (c.company || "—").slice(0, 26).padEnd(26)
    const loc = (c.location || "—").slice(0, 24).padEnd(24)
    const scope = c.locationScope.padEnd(7)
    const date = c.date || "—"
    return `${c.id.padEnd(11)} ${title} ${company} ${loc} ${scope} ${date}`
  })
  const header =
    "ID".padEnd(11) +
    " " +
    "TITLE".padEnd(42) +
    " " +
    "COMPANY".padEnd(26) +
    " " +
    "LOCATION".padEnd(24) +
    " " +
    "SCOPE".padEnd(7) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const html = await htmlFetch(buildUrl(opts))
    const parsed = parseJobCards(html)
    const total = parsed.length

    // f_WT is ignored upstream, so remote triage has to happen here. Annotate
    // every card with its location specificity, and (with --triage-remote) keep
    // only the scopes worth spending a detail fetch on, strongest signal first.
    let cards: TriagedCard[] = parsed.map((c) => ({
      ...c,
      locationScope: classifyLocationScope(c.location),
    }))

    let droppedNarrow = 0
    if (opts.triageRemote) {
      const kept = cards.filter((c) => REMOTE_CANDIDATE_SCOPES.includes(c.locationScope))
      droppedNarrow = cards.length - kept.length
      const rank = (s: LocationScope) => REMOTE_CANDIDATE_SCOPES.indexOf(s)
      cards = kept.sort((a, b) => rank(a.locationScope) - rank(b.locationScope))
    }

    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      // LinkedIn's guest search endpoint silently ignores f_WT (verified
      // 2026-08-18: identical results with and without --remote remote), so a
      // requested work-type filter is NOT actually applied server-side. Surface
      // that in meta so callers stop trusting the flag and filter/triage on
      // each card's location text instead.
      const meta: Record<string, unknown> = { count: cards.length, page: opts.page }
      if (opts.triageRemote) {
        meta.triageRemote = true
        meta.parsed = total
        meta.droppedNarrow = droppedNarrow
        meta.note =
          "locationScope measures how specific the location string is, not whether the role is " +
          "remote. It decides fetch order and budget only; the location gate still needs the " +
          "posting body or the employer's ATS entry."
      }
      if (workTypeFlag(opts.remote)) {
        meta.warning = opts.triageRemote
          ? "LinkedIn guest search ignores the work-type filter (f_WT); results were triaged " +
            "client-side by locationScope instead."
          : "LinkedIn guest search ignores the work-type filter (f_WT); results are NOT filtered to " +
            `"${opts.remote}". Pass --triage-remote to filter by location scope client-side.`
      }
      process.stdout.write(
        JSON.stringify({ meta, results: cards }, null, 2) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
