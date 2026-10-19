import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.ts"

interface SearchResponse {
  meta: { count: number; page: number; total: number }
  results: Array<{ id: string | null; title: string | null; url: string | null }>
}

describe("arbeitnow-cli", () => {
  test("unknown command exits 1 with JSON error on stderr", async () => {
    const result = await runCLI(["bogus"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("BAD_CMD")
  })

  test("bad --remote value exits 1 with JSON error", async () => {
    const result = await runCLI(["search", "--remote", "hybrid"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("BAD_ARG")
  })

  // 20s timeout: since the pinned-posting fix, an age-window search scans up to
  // 4 feed pages (sequential network fetches) instead of stopping at the first
  // out-of-window job, so 5s is no longer enough on a slow connection.
  test(
    "live search returns results with required fields",
    async () => {
      const result = await runCLI(["search", "--limit", "3", "--jobage", "30"])
      const data = parseJSON<SearchResponse>(result)
      expect(data.meta.count).toBeGreaterThan(0)
      expect(data.results.length).toBeLessThanOrEqual(3)
      for (const job of data.results) {
        expect(job.id).toBeTruthy()
        expect(job.title).toBeTruthy()
        // Most postings link to arbeitnow.com, but the feed sometimes carries an
        // external application URL directly — assert a sane URL, not the host.
        expect(job.url).toMatch(/^https?:\/\//)
      }
    },
    20000,
  )
})
