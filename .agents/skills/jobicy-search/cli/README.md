# jobicy-cli

Zero-dependency Bun CLI for Jobicy's public remote-jobs API. See `../SKILL.md`
for the command reference and `../url-reference.md` for endpoint documentation.

```bash
bun install        # dev types only (typescript, @types/bun)
bun run typecheck
bun run test       # includes a live smoke test against the API
bun run src/cli.ts search -i hr -g europe --format table
```
