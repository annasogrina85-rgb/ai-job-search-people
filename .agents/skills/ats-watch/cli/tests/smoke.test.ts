import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.ts"

interface SearchResponse {
  meta: { count: number; page: number; total: number; companiesPolled: number }
  results: Array<{
    id: string | null
    title: string | null
    url: string | null
    date: string | null
    ageHours: number | null
  }>
}

describe("ats-watch", () => {
  test("unknown command exits 1 with JSON error on stderr", async () => {
    const result = await runCLI(["bogus"])
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stderr).code).toBe("BAD_CMD")
  })

  test("non-numeric --hours exits 1 with JSON error", async () => {
    const result = await runCLI(["search", "--hours", "soon"])
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG")
  })

  test("unknown --family exits 1 with JSON error", async () => {
    const result = await runCLI(["search", "--family", "wizards"])
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stderr).code).toBe("BAD_ARG")
  })

  test("malformed detail id exits 1 with JSON error", async () => {
    const result = await runCLI(["detail", "not-a-real-id"])
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stderr).code).toBe("BAD_ID")
  })

  test("companies command lists the registry", async () => {
    const result = await runCLI(["companies"])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("companies tracked")
  })

  test("live single-company search returns dated, sorted results", async () => {
    const result = await runCLI(["search", "-c", "cohere", "--limit", "5"])
    const data = parseJSON<SearchResponse>(result)
    expect(data.meta.companiesPolled).toBe(1)
    expect(data.results.length).toBeGreaterThan(0)
    for (const job of data.results) {
      expect(job.id).toMatch(/^(ashby|greenhouse|lever|workable|smartrecruiters|recruitee):[^:]+:.+/)
      expect(job.title).toBeTruthy()
      expect(job.url).toContain("http")
    }
    // newest first: ages must be non-decreasing
    const ages = data.results.map((r) => r.ageHours).filter((a): a is number => a !== null)
    for (let i = 1; i < ages.length; i++) expect(ages[i]).toBeGreaterThanOrEqual(ages[i - 1])
  })

  test("live smartrecruiters search returns dated results", async () => {
    const result = await runCLI(["search", "-c", "microstrategy1", "--limit", "5"])
    const data = parseJSON<SearchResponse>(result)
    expect(data.meta.companiesPolled).toBe(1)
    for (const job of data.results) {
      expect(job.id).toMatch(/^smartrecruiters:[^:]+:.+/)
      expect(job.url).toContain("http")
    }
  })

  test("live workable search returns dated results", async () => {
    const result = await runCLI(["search", "-c", "optasia", "--limit", "5"])
    const data = parseJSON<SearchResponse>(result)
    expect(data.meta.companiesPolled).toBe(1)
    for (const job of data.results) {
      expect(job.id).toMatch(/^workable:[^:]+:.+/)
      expect(job.url).toContain("http")
    }
  })

  test("live recruitee search returns dated results with locations[] geography", async () => {
    const result = await runCLI(["search", "-c", "pvcase", "--limit", "5"])
    const data = parseJSON<SearchResponse>(result)
    expect(data.meta.companiesPolled).toBe(1)
    expect(data.results.length).toBeGreaterThan(0)
    for (const job of data.results) {
      expect(job.id).toMatch(/^recruitee:[^:]+:.+/)
      expect(job.url).toContain("http")
      // Recruitee dates arrive as "2026-08-31 14:45:48 UTC"; the fetcher must
      // normalize them, or --hours silently treats fresh roles as undateable.
      expect(job.date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(job.ageHours).not.toBeNull()
      // Geography must come from locations[], never the "Remote job" display
      // string — this is the field that makes EU eligibility visible.
      expect(job.location).not.toBe("Remote job")
    }
  })

  test("--hours narrows the result set", async () => {
    const wide = parseJSON<SearchResponse>(await runCLI(["search", "-c", "cohere"]))
    const narrow = parseJSON<SearchResponse>(await runCLI(["search", "-c", "cohere", "--hours", "1"]))
    expect(narrow.meta.total).toBeLessThanOrEqual(wide.meta.total)
  })
})
