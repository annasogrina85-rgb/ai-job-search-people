#!/usr/bin/env bun
// Self-contained CLI that polls employers' ATS job boards directly (Ashby,
// Greenhouse, Lever, Workable, SmartRecruiters, Recruitee). Public APIs, no
// authentication, zero runtime dependencies. Unlike portal search, these
// return every open role with an exact publish timestamp — which is what
// makes same-day applying possible.

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import { loadCompanies } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", n: "limit", f: "family", c: "company" }
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

const HELP = `ats-watch — poll employers' ATS boards directly
(Ashby / Greenhouse / Lever / Workable / SmartRecruiters / Recruitee)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <ats:slug:jobid> [--format json|plain]
  bun run src/cli.ts companies

SEARCH FLAGS
  --hours <n>            Only roles published within the last N hours (the
                         same-day-apply filter). Omit for all open roles.
  --family, -f <name>    Role family: people (default) | all.
  --query, -q <text>     Extra keyword filter; all terms must match.
  --company, -c <name>   Restrict to one company (slug or name substring).
  --remote               Keep only roles that look remote/EMEA/Europe.
  --with-description     Include full descriptions (json format only).
  --page <n>             1-indexed page. Default 1.
  --limit, -n <n>        Results per page. Default 40.
  --format <fmt>         json (default) | table | plain.

EXAMPLES
  # The daily sweep: People roles posted in the last 24h, remote-ish
  bun run src/cli.ts search --hours 24 --remote --format table

  # Everything People-shaped currently open at one company
  bun run src/cli.ts search -c <slug> --format table

  # Full detail for one posting
  bun run src/cli.ts detail ashby:<slug>:<job-uuid> --format plain
`

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const parseIntFlag = (name: string): number | null | undefined => {
    if (flags[name] === undefined) return undefined
    const val = parseInt(flags[name] as string, 10)
    if (isNaN(val)) {
      process.stderr.write(
        JSON.stringify({ error: `--${name} must be a number, got "${flags[name]}"`, code: "BAD_ARG" }) + "\n",
      )
      return null
    }
    return val
  }

  if (cmd === "companies") {
    const list = loadCompanies()
    const rows = list.map((c) => `${c.ats.padEnd(11)} ${c.slug.padEnd(14)} ${c.name}`)
    process.stdout.write(rows.join("\n") + `\n\n${list.length} companies tracked\n`)
    return 0
  }

  if (cmd === "search") {
    const fmt = (flags.format as string) || "json"
    const hours = parseIntFlag("hours")
    const page = parseIntFlag("page")
    const limit = parseIntFlag("limit")
    if (hours === null || page === null || limit === null) return 1

    const opts: SearchOpts = {
      query: typeof flags.query === "string" ? flags.query : undefined,
      family: typeof flags.family === "string" ? flags.family : "people",
      maxAgeHours: hours,
      remoteOnly: flags.remote === true,
      company: typeof flags.company === "string" ? flags.company : undefined,
      page: page ? Math.max(1, page) : 1,
      limit,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
      withDescription: flags["with-description"] === true,
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(JSON.stringify({ error: "detail requires an <ats:slug:jobid>", code: "NO_ID" }) + "\n")
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = { id, format: fmt === "plain" ? "plain" : "json" }
    return runDetail(opts)
  }

  process.stderr.write(JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n")
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e), code: "INTERNAL_ERROR" }) + "\n",
    )
    process.exit(1)
  })
