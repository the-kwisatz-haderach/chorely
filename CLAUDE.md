## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues (via the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Architecture

Read the ADRs in `docs/adr/` before adding or moving server code, API routes, schema, tests or infra; ADR 0004 fixes where Group data access lives and how routes are scoped. Place each new function where its ADR puts it. When a change needs a place the ADRs do not cover, amend the ADR in the same PR.

## Workflow

Run `/implement` on a feature branch off `main`, push it, and open a PR whose body says `Closes #<ticket>`.
