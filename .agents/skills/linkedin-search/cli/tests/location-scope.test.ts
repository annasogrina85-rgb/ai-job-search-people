import { describe, expect, test } from "bun:test"
import { classifyLocationScope, REMOTE_CANDIDATE_SCOPES } from "../src/helpers.ts"

describe("classifyLocationScope", () => {
  test("detects explicit remote wording regardless of granularity", () => {
    expect(classifyLocationScope("Remote")).toBe("remote")
    expect(classifyLocationScope("Berlin, Germany (Remote)")).toBe("remote")
    expect(classifyLocationScope("Anywhere")).toBe("remote")
    expect(classifyLocationScope("Worldwide")).toBe("remote")
  })

  test("classifies a single component as broad", () => {
    expect(classifyLocationScope("Germany")).toBe("broad")
    expect(classifyLocationScope("European Union")).toBe("broad")
    // Metro areas land here too - documented, not a bug.
    expect(classifyLocationScope("Greater Madrid Metropolitan Area")).toBe("broad")
  })

  test("classifies two components as medium, both region and city forms", () => {
    expect(classifyLocationScope("Bavaria, Germany")).toBe("medium")
    expect(classifyLocationScope("Riga, Latvia")).toBe("medium")
  })

  test("classifies a fully-qualified triple as narrow", () => {
    expect(classifyLocationScope("Berlin, Berlin, Germany")).toBe("narrow")
    expect(classifyLocationScope("Helsinki, Uusimaa, Finland")).toBe("narrow")
  })

  test("handles missing, empty and whitespace-only input", () => {
    expect(classifyLocationScope(null)).toBe("unknown")
    expect(classifyLocationScope(undefined)).toBe("unknown")
    expect(classifyLocationScope("")).toBe("unknown")
    expect(classifyLocationScope("   ")).toBe("unknown")
  })

  test("tolerates trailing and repeated separators", () => {
    expect(classifyLocationScope("Germany,")).toBe("broad")
    expect(classifyLocationScope("Bavaria,, Germany")).toBe("medium")
  })

  test("keeps medium in the candidate set so regional remote roles survive", () => {
    expect(REMOTE_CANDIDATE_SCOPES).toContain("medium")
    expect(REMOTE_CANDIDATE_SCOPES).not.toContain("narrow")
    expect(REMOTE_CANDIDATE_SCOPES).not.toContain("unknown")
  })

  test("candidate scopes are ordered best-signal-first", () => {
    expect([...REMOTE_CANDIDATE_SCOPES]).toEqual(["remote", "broad", "medium"])
  })
})
