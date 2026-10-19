# ats-watch-cli

Zero-dependency Bun CLI that polls employers' ATS job boards (Ashby,
Greenhouse, Lever) directly. See `../SKILL.md` for the command reference,
`../url-reference.md` for the API documentation, and `../companies.json` for
the tracked company registry.

```bash
bun install        # dev types only (typescript, @types/bun)
bun run typecheck
bun run test       # includes live smoke tests against the ATS APIs
bun run src/cli.ts search --hours 24 --remote --format table
```
