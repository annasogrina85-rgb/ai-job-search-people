import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.ts"

interface SearchResponse {
  meta: { count: number; page: number; total: number }
  results: Array<{ id: string | null; title: string | null; url: string | null }>
}

describe("jobicy-cli", () => {
  test("unknown command exits 1 with JSON error on stderr", async () => {
    const result = await runCLI(["bogus"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("BAD_CMD")
  })

  test("non-numeric --limit exits 1 with JSON error", async () => {
    const result = await runCLI(["search", "--limit", "abc"])
    expect(result.exitCode).toBe(1)
    const err = JSON.parse(result.stderr)
    expect(err.code).toBe("BAD_ARG")
  })

  test("live search returns results with required fields", async () => {
    const result = await runCLI(["search", "-i", "hr", "--limit", "3"])
    const data = parseJSON<SearchResponse>(result)
    expect(data.meta.count).toBeGreaterThan(0)
    expect(data.results.length).toBeLessThanOrEqual(3)
    for (const job of data.results) {
      expect(job.id).toBeTruthy()
      expect(job.title).toBeTruthy()
      expect(job.url).toContain("jobicy.com")
    }
  })
})
