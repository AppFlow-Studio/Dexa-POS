# AI-Assisted Documentation Guide

## Goal

Use AI to reduce documentation effort without creating long, duplicated, or
unverified documents. The engineer remains responsible for scope, accuracy,
and evidence.

## Minimum Workflow

1. Find the existing feature folder under `docs/features/`.
2. Ask AI to inspect the ticket, changed files, and current feature docs before
   drafting anything.
3. Update the existing canonical document when possible. Do not create a new
   status file for every conversation.
4. Record contracts, decisions, migrations, environment variables, test
   results, manual QA, and remaining work. Omit narration visible in the diff.
5. Require exact file references and separate confirmed behavior from
   assumptions or pending QA.
6. Run documentation link and inventory checks before requesting review.

## Prompt Template

```text
Read the ticket, the current feature documentation, and the changed files.
Update the canonical document in docs/features/<feature>/.

Keep it concise and include:
- goal and scope
- current behavior and contracts
- decisions and tradeoffs
- files/migrations/env dependencies
- tests run with results
- exact manual QA
- remaining work and owner

Do not invent results, duplicate existing docs, edit unrelated files, or mark
manual QA complete without evidence. Report every documentation path changed.
```

## Quality Bar

- Organize by feature, not chat session or developer name.
- Distinguish implemented, deployed, tested, and approved states.
- Link to the canonical ticket/index instead of copying the full ticket.
- State database and environment dependencies explicitly.
- Leave enough evidence for another engineer to validate or continue the work.

Do not ask AI to restate obvious code, speculate about architecture, or create
multiple summaries for one change. One maintained feature document plus a
short PR description is normally sufficient.

## Ready-To-Post Group Message

```text
POS and website docs are organized by feature under docs/features/. When using
AI, first point it to the ticket, changed files, and existing feature folder.
Ask it to update the canonical doc with contracts, decisions, migrations/env
needs, tests, manual QA, and remaining work. Do not create a document for every
chat or let AI claim unverified results. Every new feature should ship with a
doc in its feature folder; cross-feature material belongs under
docs/engineering, docs/quality, or docs/handoffs.
```

Posting this message to the engineering group remains a manual ticket step.
