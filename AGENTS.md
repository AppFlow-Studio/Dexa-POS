# Repo Workflow

## Ticket Tracking

- Keep the running ticket index in `docs/tickets/ALL-TICKETS-REFERENCE.md`.
- Create or update ticket documentation in the owning
  `docs/features/<feature-name>/` folder.
- Put cross-feature material in `docs/engineering/`, `docs/quality/`, or
  `docs/handoffs/` instead of creating a generic task dump.
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
- Follow `docs/engineering/developer-experience/AI-DOCUMENTATION-GUIDE.md`
  for AI-assisted documentation.

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
