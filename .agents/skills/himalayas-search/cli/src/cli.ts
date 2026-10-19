#!/usr/bin/env bun
// Self-contained CLI for searching remote jobs across Himalayas' cross-company
// feed. JSON API, no authentication, zero runtime dependencies.
//
// This is the breadth complement to ats-watch: ats-watch polls a fixed registry
// of companies and gives exact publish timestamps for those; this reads a feed
// that spans every employer Himalayas has ingested (~105k live postings as of
// 2026-09-08), so a company nobody thought to register still surfaces.

import { runSearch, type SearchOpts } from "./commands/search.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit", h: "hours" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `himalayas-cli — search remote jobs across every company on Himalayas

Breadth source: unlike ats-watch (fixed company registry) this feed is
cross-company, so employers nobody registered still show up. There is no
server-side filtering — everything below is applied client-side while paging
newest-first, so a tight --hours is what keeps the run cheap.

USAGE
  bun run src/cli.ts search [flags]

SEARCH FLAGS
  --hours, -h <n>         Recency window. Paging stops at the cutoff. Default 30.
  --query, -q <terms>     Comma-separated title keywords, OR-matched.
  --role-family hr        Use the built-in senior-People vocabulary instead of
                          --query (HRBP, People Partner, Head of People, OD,
                          people systems, performance management, …).
  --scope <mode>          eligible (default) | eu | any
                            eligible - postings actually takeable from
                                       --home-country: unrestricted, region-wide
                                       (Europe/EMEA/Worldwide), or naming that
                                       country. Drops single-country postings
                                       pinned elsewhere ("Germany only").
                            eu       - any EU/EEA/CH country restriction.
                            any      - no location filtering.
  --home-country <name>   Country for scope=eligible. Default "Spain".
  --tz-min <n>            Lowest workable UTC offset. Default -1.
  --tz-max <n>            Highest workable UTC offset. Default 3.
  --no-tz                 Skip the timezone filter entirely.
  --min-salary <n>        Drop postings whose stated MAX salary is below this.
                          Postings with no salary data are kept.
  --seniority <list>      e.g. Senior,Manager,Director,Executive.
  --max-pages <n>         Hard cap on pages fetched (20 postings each).
                          Default 200. meta.truncated says if it bit.
  --limit, -n <n>         Cap results emitted.
  --format <fmt>          json (default) | table | plain.

EXAMPLES
  bun run src/cli.ts search --hours 30 --role-family hr --format table
  bun run src/cli.ts search --hours 72 --role-family hr --scope eu --format json
  bun run src/cli.ts search -q "head of people,people partner" --hours 48
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || cmd === "help") {
    process.stdout.write(HELP)
    return cmd && cmd !== "help" ? 1 : 0
  }

  if (cmd !== "search") {
    process.stderr.write(
      JSON.stringify({ error: `Unknown command: ${cmd}`, code: "BAD_COMMAND" }) + "\n",
    )
    return 1
  }

  const num = (v: unknown, d: number): number => {
    const n = Number(v)
    return Number.isFinite(n) ? n : d
  }

  const scopeRaw = typeof flags.scope === "string" ? flags.scope : "eligible"
  if (!["eligible", "eu", "any"].includes(scopeRaw)) {
    process.stderr.write(
      JSON.stringify({ error: `Invalid --scope: ${scopeRaw}`, code: "BAD_SCOPE" }) + "\n",
    )
    return 1
  }

  const formatRaw = typeof flags.format === "string" ? flags.format : "json"
  if (!["json", "table", "plain"].includes(formatRaw)) {
    process.stderr.write(
      JSON.stringify({ error: `Invalid --format: ${formatRaw}`, code: "BAD_FORMAT" }) + "\n",
    )
    return 1
  }

  const opts: SearchOpts = {
    hours: num(flags.hours, 30),
    query: typeof flags.query === "string" ? flags.query : undefined,
    roleFamily: typeof flags["role-family"] === "string" ? flags["role-family"] : undefined,
    scope: scopeRaw as "eligible" | "eu" | "any",
    homeCountry: typeof flags["home-country"] === "string" ? flags["home-country"] : "Spain",
    tzMin: num(flags["tz-min"], -1),
    tzMax: num(flags["tz-max"], 3),
    applyTz: flags["no-tz"] !== true,
    minSalary: flags["min-salary"] ? num(flags["min-salary"], 0) : undefined,
    seniority: typeof flags.seniority === "string" ? flags.seniority : undefined,
    maxPages: num(flags["max-pages"], 200),
    limit: flags.limit ? num(flags.limit, 0) : undefined,
    format: formatRaw as "json" | "table" | "plain",
  }

  return runSearch(opts)
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "UNCAUGHT" }) +
        "\n",
    )
    process.exit(1)
  })
