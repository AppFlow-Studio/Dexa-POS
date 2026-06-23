# Repo Workflow

## Ticket Tracking

- Keep a running ticket index in `tasks/ticket-log.md`.
- Create one task file per ticket in `tasks/`.
- Each ticket file should capture:
  - ticket summary
  - scope / non-scope
  - implementation plan
  - progress updates
  - verification status
  - file touch list

## Change Rules

- Prefer the smallest ticket-scoped change.
- Do not change `package.json` or lockfiles unless the task explicitly requires it.
- Prefer targeted verification over repo-wide build/typecheck runs when the repo has known unrelated issues.
- Record any manual QA still required in the ticket markdown before closing the task.

## Suggested Ticket File Shape

```md
# <ticket name>

## Summary
## Scope
## Plan
## Progress
## Verification
## Files
## Open QA
```
