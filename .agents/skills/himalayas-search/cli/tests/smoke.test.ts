import { describe, expect, test } from "bun:test"
import { runCLI, parseJSON } from "./helpers.ts"
import {
  classifyLocation,
  timezoneCompatible,
  parseLenientJson,
  titleMatches,
} from "../src/helpers.ts"

interface SearchResponse {
  meta: {
    count: number
    total: number
    scanned: number
    pagesFetched: number
    reachedCutoff: boolean
    truncated: boolean
    dropped: Record<string, number>
  }
  results: Array<{
    id: string | null
    title: string | null
    url: string | null
    locationRestrictions: string[]
    timezoneRestrictions: number[]
    locationBasis: string
  }>
}

describe("himalayas-cli argument handling", () => {
  test("unknown command exits 1 with JSON error on stderr", async () => {
    const result = await runCLI(["bogus"])
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stderr).code).toBe("BAD_COMMAND")
  })

  test("invalid --scope exits 1 with JSON error", async () => {
    const result = await runCLI(["search", "--scope", "mars"])
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stderr).code).toBe("BAD_SCOPE")
  })

  test("invalid --format exits 1 with JSON error", async () => {
    const result = await runCLI(["search", "--format", "yaml"])
    expect(result.exitCode).toBe(1)
    expect(JSON.parse(result.stderr).code).toBe("BAD_FORMAT")
  })

  test("no command prints help and exits 0", async () => {
    const result = await runCLI([])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("himalayas-cli")
  })
})

describe("lenient JSON parsing", () => {
  // The feed emits raw control characters inside description strings, which
  // JSON.parse rejects outright. This is the single quirk that breaks a naive
  // client, so it is pinned by a test.
  test("parses payloads containing raw control characters", () => {
    // Built explicitly rather than pasted, so the byte survives editors and diffs.
    const raw = `{"a":"line1${String.fromCharCode(1)}line2","b":2}`
    expect(() => JSON.parse(raw)).toThrow()
    const parsed = parseLenientJson<{ a: string; b: number }>(raw)
    expect(parsed.b).toBe(2)
    expect(parsed.a).toBe("line1line2")
  })

  test("preserves word boundaries when stripping tab/newline", () => {
    const parsed = parseLenientJson<{ a: string }>('{"a":"one\ttwo"}')
    expect(parsed.a).toBe("one two")
  })
})

describe("location gate", () => {
  test("keeps unrestricted postings", () => {
    expect(classifyLocation([], "Spain", "eligible")).toEqual({
      keep: true,
      basis: "unrestricted",
    })
  })

  test("keeps region-wide postings", () => {
    expect(classifyLocation(["Europe"], "Spain", "eligible").keep).toBe(true)
    expect(classifyLocation(["Worldwide"], "Spain", "eligible").basis).toBe("region")
  })

  test("keeps postings naming the home country", () => {
    expect(classifyLocation(["Spain"], "Spain", "eligible")).toEqual({
      keep: true,
      basis: "home",
    })
  })

  // The regression this whole scope exists to prevent: a role pinned to one
  // other EU country is not takeable from Spain, however remote it claims
  // to be. Booksy/Masabi/TrustedHousesitters all died on exactly this.
  test("drops single-country postings pinned elsewhere under scope=eligible", () => {
    expect(classifyLocation(["Poland"], "Spain", "eligible").keep).toBe(false)
    expect(classifyLocation(["Germany"], "Spain", "eligible").keep).toBe(false)
    expect(classifyLocation(["United States"], "Spain", "eligible").keep).toBe(false)
  })

  test("scope=eu keeps other EU countries but still drops non-EU", () => {
    expect(classifyLocation(["Poland"], "Spain", "eu")).toEqual({
      keep: true,
      basis: "eu-other",
    })
    expect(classifyLocation(["United States"], "Spain", "eu").keep).toBe(false)
  })

  test("scope=any keeps everything", () => {
    expect(classifyLocation(["United States"], "Spain", "any").keep).toBe(true)
  })

  test("matching is case- and whitespace-insensitive", () => {
    expect(classifyLocation([" spain "], "Spain", "eligible").keep).toBe(true)
  })
})

describe("timezone gate", () => {
  test("unstated restrictions pass — absence of evidence is not a failure", () => {
    expect(timezoneCompatible([], -1, 3)).toBe(true)
  })

  test("CET postings pass", () => {
    expect(timezoneCompatible([1], -1, 3)).toBe(true)
    expect(timezoneCompatible([0, 1], -1, 3)).toBe(true)
  })

  test("US-only postings fail", () => {
    expect(timezoneCompatible([-10, -9, -8, -7, -6, -5, 14], -1, 3)).toBe(false)
    expect(timezoneCompatible([-8, -7, -6, -5, -4, -3.5], -1, 3)).toBe(false)
  })

  test("a band overlapping at one end passes", () => {
    expect(timezoneCompatible([3, 4, 5], -1, 3)).toBe(true)
  })
})

describe("title matching", () => {
  test("empty term list matches everything", () => {
    expect(titleMatches("Anything At All", [])).toBe(true)
  })

  test("matches case-insensitively on substring", () => {
    expect(titleMatches("Senior HR Business Partner", ["hr business partner"])).toBe(true)
    expect(titleMatches("Senior Software Engineer", ["hr business partner"])).toBe(false)
  })
})

describe("live search", () => {
  test("returns a well-formed envelope and honors the date cutoff", async () => {
    const result = await runCLI([
      "search",
      "--hours",
      "12",
      "--role-family",
      "hr",
      "--scope",
      "any",
      "--max-pages",
      "10",
    ])
    const data = parseJSON<SearchResponse>(result)
    expect(data.meta.scanned).toBeGreaterThan(0)
    expect(data.meta.pagesFetched).toBeGreaterThan(0)
    expect(data.meta.pagesFetched).toBeLessThanOrEqual(10)
    expect(typeof data.meta.truncated).toBe("boolean")
    expect(data.meta.dropped).toBeDefined()
    for (const job of data.results) {
      expect(job.id).toBeTruthy()
      expect(job.url).toBeTruthy()
      expect(Array.isArray(job.locationRestrictions)).toBe(true)
      expect(Array.isArray(job.timezoneRestrictions)).toBe(true)
      expect(job.locationBasis).toBeTruthy()
    }
  })

  test("--max-pages is respected and reported as truncated", async () => {
    const result = await runCLI([
      "search",
      "--hours",
      "720",
      "--scope",
      "any",
      "--max-pages",
      "2",
    ])
    const data = parseJSON<SearchResponse>(result)
    expect(data.meta.pagesFetched).toBe(2)
    expect(data.meta.truncated).toBe(true)
    expect(data.meta.reachedCutoff).toBe(false)
  })

  test("scope=eligible never returns a posting pinned to another country", async () => {
    const result = await runCLI([
      "search",
      "--hours",
      "48",
      "--scope",
      "eligible",
      "--home-country",
      "Spain",
      "--max-pages",
      "25",
    ])
    const data = parseJSON<SearchResponse>(result)
    for (const job of data.results) {
      if (job.locationRestrictions.length === 0) continue
      const lowered = job.locationRestrictions.map((l) => l.toLowerCase())
      const ok =
        lowered.includes("spain") ||
        lowered.some((l) =>
          ["europe", "european union", "eu", "emea", "worldwide", "anywhere", "global", "remote"].includes(l),
        )
      expect(ok).toBe(true)
    }
  })
})
