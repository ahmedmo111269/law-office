# Law Office — offline-first data foundation

Local-first database and repository layer for an Egyptian law-office management program. **No UI, no network sync, no cloud, no AI, no paid services.** Everything runs against a local SQLite file.

- Branch: `arena/691f011a-law-office` (baseline `main` at `b5769b8`)
- Schema: **v1** · 57 application tables · 90 indexes · 16 triggers · 54 lookup lists / 374 reference items
- Tests: **21/21 passing** (`node:test`, real SQLite files, temporary directories)
- Engine status: **SQLite implemented** for desktop/native; **IndexedDB is only an interface reservation — not implemented** (see `docs/decisions.md`, `docs/limits-and-decisions.md`)

## Quick start

```bash
npm install
npm run typecheck
npm run typecheck:tests
npm test

npm run db:init   -- --db data/office.sqlite
npm run db:check  -- --db data/office.sqlite
npm run db:info   -- --db data/office.sqlite
npm run db:backup -- --db data/office.sqlite --label initial
```

`data/` and `*.sqlite` are ignored by Git. Do not put real client data in a development checkout.

## What exists

- Full v1 DDL and seed: parties/persons/organisations, files/cases/courts, hearings/judgments, tasks/announcements, documents/versions/links, contracts/POAs, operational finance, appointments/reminders, audit, deletion batches, sync metadata, Arabic search.
- Storage boundary (`DatabaseAdapter`) and SQLite adapter with WAL, foreign keys, nested savepoints, 5 s busy timeout and application-id protection.
- Repositories for all core entities, with revision tracking, sync outbox, redacted audit log and search projection on every write.
- Versioned, checksummed, once-only migrations with per-migration transactions and failure records.
- WAL-safe backup via `VACUUM INTO`, integrity/version verification, SHA-256 sidecar, non-destructive restore and external-attachment warning.
- Local sync readiness: monotonic outbox, retry states, conflict records, per-entity merge policies. **No transport.**
- Arabic-normalised search with FTS5 and a LIKE fallback.
- Operator CLI: init/check/info/backup/verify/backups/restore/search/reindex/migrate.
- Executed tests for all 20 required scenarios plus a load benchmark.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | Layer map, data flow, write invariants, file inventory |
| [`docs/decisions.md`](docs/decisions.md) | Storage engine per platform and architecture decisions |
| [`docs/er-diagram.md`](docs/er-diagram.md) | Mermaid ER diagram and relationship rules |
| [`docs/schema.md`](docs/schema.md) | Generated data dictionary: every table, column, FK, index, constraint, seed lookup |
| [`docs/migrations.md`](docs/migrations.md) | Migration mechanism, adding v2, recovery |
| [`docs/backup-restore.md`](docs/backup-restore.md) | Backup/restore interface, WAL safety, attachments, limits |
| [`docs/sync-readiness.md`](docs/sync-readiness.md) | Outbox, conflict metadata, policies, what is missing |
| [`docs/testing.md`](docs/testing.md) | How to run tests/CLI/benchmark, troubleshooting |
| [`docs/test-results.md`](docs/test-results.md) | Executed results, 20-scenario coverage, deferred tests |
| [`docs/benchmark-results.md`](docs/benchmark-results.md) | Recorded load-test numbers |
| [`docs/limits-and-decisions.md`](docs/limits-and-decisions.md) | Issues, risks, pending approvals, explicitly not implemented |
| [`docs/final-report.md`](docs/final-report.md) | Phase report: repo state, deliverables, results, next step |

## Data-safety rules

- Never edit an applied migration; v1 checksum changes invalidate old development databases by design.
- Never raw-copy a live WAL database; use the backup manager.
- Never hard-delete financial or audit rows; corrections are reversing entries.
- No legal deadline is computed by the system. Dates entered by users are stored as entered.
- Lookup lists are editable data, not closed code enums.

## Commands

```bash
npm run typecheck          # src only
npm run typecheck:tests    # src + test + benchmark
npm test                   # 20 required scenarios + outbox test
npm run db:bench -- --scale=1
npm run db:gen-manifest    # regenerate required-schema manifest
npm run db:gen-schema      # regenerate docs/schema.md
```
