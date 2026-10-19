import { describe, expect, test } from "bun:test"
import { retryDelayMs } from "../src/helpers.ts"

function res(headers: Record<string, string>) {
  const h = new Headers(headers)
  return { headers: { get: (n: string) => h.get(n) } }
}

describe("retryDelayMs", () => {
  test("honours a numeric Retry-After, in seconds", () => {
    expect(retryDelayMs(res({ "retry-after": "30" }), 0)).toBe(30_000)
  })

  test("clamps a huge Retry-After to the ceiling", () => {
    expect(retryDelayMs(res({ "retry-after": "9999" }), 0, 500, 60_000)).toBe(60_000)
  })

  test("honours an HTTP-date Retry-After", () => {
    const when = new Date(Date.now() + 20_000).toUTCString()
    const delay = retryDelayMs(res({ "retry-after": when }), 0)
    // Second-granularity date, so allow a little slack either side.
    expect(delay).toBeGreaterThan(18_000)
    expect(delay).toBeLessThanOrEqual(21_000)
  })

  test("never returns a negative delay for a past Retry-After date", () => {
    const past = new Date(Date.now() - 60_000).toUTCString()
    expect(retryDelayMs(res({ "retry-after": past }), 0)).toBe(0)
  })

  test("falls back to exponential backoff when the header is absent", () => {
    // random() = 1 gives the full ceiling: baseDelay * 2^attempt.
    expect(retryDelayMs(res({}), 0, 500, 60_000, () => 1)).toBe(500)
    expect(retryDelayMs(res({}), 3, 500, 60_000, () => 1)).toBe(4000)
  })

  test("backoff ceiling is capped at maxDelay", () => {
    expect(retryDelayMs(res({}), 20, 500, 60_000, () => 1)).toBe(60_000)
  })

  test("jitters within the upper half, so callers spread out", () => {
    expect(retryDelayMs(res({}), 4, 500, 60_000, () => 0)).toBe(4000)
    expect(retryDelayMs(res({}), 4, 500, 60_000, () => 0.5)).toBe(6000)
    expect(retryDelayMs(res({}), 4, 500, 60_000, () => 1)).toBe(8000)
  })

  test("keeps a floor of half the ceiling even on the unluckiest draw", () => {
    // Regression guard: full jitter could return 0 here, which let all retries
    // burn through instantly and fail while the rate window was still shut.
    for (const attempt of [0, 1, 2, 3, 4, 5, 6]) {
      const ceiling = Math.min(500 * 2 ** attempt, 60_000)
      expect(retryDelayMs(res({}), attempt, 500, 60_000, () => 0)).toBe(ceiling / 2)
    }
  })

  test("total backoff across all retries survives a rate-limit window", () => {
    let total = 0
    for (let attempt = 0; attempt < 6; attempt++) {
      total += retryDelayMs(res({}), attempt, 500, 60_000, () => 0)
    }
    // Worst case must still be tens of seconds, not milliseconds.
    expect(total).toBeGreaterThan(15_000)
  })

  test("ignores an unparseable Retry-After and backs off instead", () => {
    expect(retryDelayMs(res({ "retry-after": "soon" }), 2, 500, 60_000, () => 1)).toBe(2000)
  })
})
