# Dexa POS Documentation

This directory is the canonical entry point for POS documentation. Start with
the product area you are changing instead of searching dated files at the
repository root.

## Find Documentation

| Area | Use it for |
| --- | --- |
| [`features/`](features/README.md) | Product behavior, plans, contracts, runbooks, and feature QA |
| [`engineering/`](engineering/README.md) | Architecture, database, performance, observability, upgrades, and developer experience |
| [`quality/`](quality/README.md) | Cross-feature QA and closure tracking |
| [`guides/`](guides/README.md) | Merchant and operator guides that span features |
| [`handoffs/`](handoffs/README.md) | Cross-feature senior handoffs and release summaries |
| [`tickets/`](tickets/README.md) | Active ticket index |
| [`reference/`](reference/README.md) | Legal and compact reference pointers |
| [`templates/`](templates/README.md) | Templates for new documentation |

## Documentation Rule

Every feature change must update or add documentation in its existing
`docs/features/<feature-name>/` folder. Create a feature folder only when no
existing product area owns the behavior.

A useful feature document records only what another engineer needs to operate,
review, test, or extend the feature:

1. Purpose and scope.
2. Current behavior and important contracts.
3. Decisions and tradeoffs.
4. Files, migrations, environment variables, and dependencies.
5. Automated verification and exact manual QA.
6. Remaining work, blockers, and ownership.

Use the [AI-assisted documentation guide](engineering/developer-experience/AI-DOCUMENTATION-GUIDE.md)
to keep AI-generated material concise and evidence-based.

## Repository-Level Files

- [`../README.md`](../README.md) remains the project entry point.
- [`../AGENTS.md`](../AGENTS.md) and [`../CLAUDE.md`](../CLAUDE.md) remain the
  repository workflow contracts.
- [`../privacypolicy.md`](../privacypolicy.md) remains the published app privacy
  policy.
- SQL and migration source remains with implementation under `supabase/` and
  `utils/migrations/`.

## Approval Status

This structure is prepared locally for the DevEx ticket. Temur and Abubeckr
must approve it before publish or merge.
