# Feature-Based Documentation Restructure - POS

## Summary

Reorganize existing POS documentation by feature, add a canonical entry point,
and align the repository with the website documentation taxonomy. This is an
organization-only DevEx change; it does not expand incomplete feature docs.

## Scope

- Move existing internal documentation into `docs/features/`,
  `docs/engineering/`, `docs/quality/`, `docs/handoffs/`, and supporting index
  folders.
- Preserve repository workflow files, the published privacy policy, and
  executable SQL/migration artifacts in place.
- Add navigation indexes, a migration manifest, a reusable template, and an
  AI-assisted documentation guide.
- Update stale internal documentation paths.

Out of scope:

- Writing missing feature architecture or implementation content.
- Changing application code, database behavior, dependencies, or build files.
- Publishing or merging before reviewer approval.

## Plan

- [x] Inventory tracked POS documentation and classify each artifact.
- [x] Relocate existing docs with content-preserving Git moves.
- [x] Add feature and engineering indexes plus workflow guidance.
- [x] Verify path references, inventory parity, and Markdown links.
- [ ] Obtain Temur and Abubeckr approval before publish/merge.
- [ ] Post the approved AI documentation guidance to the engineering group.

## Progress

- 2026-08-02: Classified 71 pre-existing documentation/source artifacts.
- 2026-08-02: Relocated 65 internal documentation source paths into 64
  canonical documents; two byte-identical floor-plan guides were consolidated.
- 2026-08-02: Retained `README.md`, `AGENTS.md`, `CLAUDE.md`,
  `privacypolicy.md`, and two migration source artifacts in place.
- 2026-08-02: Added canonical indexes and aligned the POS workflow with the
  already-completed website structure.

## Verification

- Migration manifest: 65 source rows, all canonical targets present, zero old
  source paths left, and zero exact-content duplicate groups.
- Retained artifacts: all six intentional retained paths present.
- Old-path reference scan: zero stale references outside the migration manifest.
- Relative Markdown link check: zero broken links across repository Markdown.
- `git diff --check`: passed; only expected Windows LF-to-CRLF notices were emitted.
- Application tests: not applicable; documentation-only change.

## Files

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/**`

## Open QA

- Temur must approve the folder structure.
- Abubeckr must review the final structure and migration manifest.
- The ready-to-post group message in `AI-DOCUMENTATION-GUIDE.md` must be posted
  manually after approval.
