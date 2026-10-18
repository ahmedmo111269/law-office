# Executed test results

Run date: **2026‑10‑18** · Branch: `arena/691f011a-law-office` · Host: Linux x64 · Node **v22.22.3** · SQLite **3.51.3** · TypeScript **5.9.3**.

## Commands and outcomes

| Command | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** |
| `npx tsc -p tsconfig.test.json` | **0 errors** (src + tests + benchmark) |
| `node --disable-warning=ExperimentalWarning --test test/*.test.ts` | **21 tests, 21 passed, 0 failed, 0 skipped**, duration **3,979.77 ms** |
| `node scripts/benchmark.ts --scale=1` | completed, see below |
| `node scripts/benchmark.ts --scale=2` | completed, see below |
| CLI `init`/`check`/`info`/`backup`/`backups`/`verify`/`search`/`reindex`/`restore`/`check` | all returned success; restored file passed schema/integrity/FK checks |

Raw tail of the final test run:

```text
1..21
# tests 21
# suites 0
# pass 21
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 3979.770466
```

## Scenario coverage

| # | Scenario | Result |
| --- | --- | --- |
| 1 | First-time creation: migration, device, search, health | PASS |
| 2 | 57-table / 90-index / 16-trigger manifest; every sync entity has header columns | PASS |
| 3 | FK and CHECK constraints rejected by SQLite | PASS |
| 4 | Client linked to two files with different roles | PASS |
| 5 | Same person with plaintiff + witness roles; duplicate role rejected | PASS |
| 6 | Master/sub file, shared case, root invariant, file numbers | PASS |
| 7 | Hearing → held → next hearing → judgment → task status history | PASS |
| 8 | Payment + charge + allocation + balances + reversal | PASS |
| 9 | Archive/unarchive reversible | PASS |
| 10 | Soft delete cascades person/client/contact/address; restore; blocked by file link | PASS |
| 11 | Outer transaction rolls back two files; successful batch commits | PASS |
| 12 | Close/reopen keeps IDs, file number; next number increments | PASS |
| 13 | Arabic search: hamza, diacritics, taa marbuta; rebuild count | PASS |
| 14 | Two independent databases: UUIDs, device codes and file prefixes differ | PASS |
| 15 | Backup integrity, checksum sidecar, tamper detection | PASS |
| 16 | Restore relation integrity, external-file warning, overwrite refused | PASS |
| 17 | Migration v1→v2 applies once, data intact, pre-migration hook called | PASS |
| 18 | Failing v2 rolls back, records `migration_failure`, v1 still opens | PASS |
| 19 | Conflict row stores both payloads and fields; resolve `merged`; local data kept | PASS |
| 19b | Outbox pending → sending → failed → sent; entity synced only when drained | PASS |
| 20 | Full workflow offline; static scan finds no http/https/net/tls/fetch usage in `src/` | PASS |

## CLI verification (real run)

- Fresh `init` on `data/demo.sqlite`: schema v1, 63 SQLite objects present, integrity `ok`, quick check `ok`, 0 FK violations, FTS5 available.
- `backup --label demo`: `lawo-v1-20261018-184551-ec03b86c-demo.sqlite`, 1,130,496 bytes, SHA-256 sidecar written.
- `verify`: `valid: true`, `integrity: "ok"`, `schemaVersion: 1`, `applicationId: 1279350607`, `checksumSidecarVerified: true`, `tablesPresent: 63`, `attachmentsIncluded: false`, `externalFileVersions: 0`.
- `restore` to a new path: succeeded; restored database passed `check` with `ok: true`, 0 FK violations, no missing tables/indexes/triggers.
- `search` on an empty database: 0 hits (expected); `reindex`: 0 documents; `fts5: true`.

## Load benchmark

Scale 1: 1,000 clients · 500 files · 500 cases · 1,000 hearings · 500 tasks · 300 documents · 300 payments. Scale 2 doubles every count. Same host, single process, one database file, WAL, `synchronous=FULL`.

| Metric | Scale 1 | Scale 2 |
| --- | --- | --- |
| Total wall time | 13,497 ms | 24,751 ms |
| Database size | 24,920,064 B (23.8 MiB) | 48,910,336 B (46.6 MiB) |
| Clients | 1,000 in 4,623 ms (4.623 ms/record) | 2,000 in 8,606 ms (4.303 ms/record) |
| Files | 500 in 2,451 ms (4.902 ms) | 1,000 in 4,348 ms (4.348 ms) |
| Cases | 500 in 2,040 ms (4.080 ms) | 1,000 in 3,812 ms (3.812 ms) |
| Hearings | 1,000 in 1,519 ms (1.519 ms) | 2,000 in 2,882 ms (1.441 ms) |
| Tasks | 500 in 798 ms (1.596 ms) | 1,000 in 1,474 ms (1.474 ms) |
| Finance (charge+payment+allocation) | 300 in 918 ms (3.060 ms) | 600 in 1,503 ms (2.505 ms) |
| Documents + links | 300 in 948 ms (3.160 ms) | 600 in 1,760 ms (2.933 ms) |
| Arabic search, limit 50 | 5 ms, 50 hits | 18 ms, 50 hits |
| List 50 files | 1 ms | 1 ms |
| Next 50 hearings | 1 ms | 1 ms |
| Full schema check + integrity | 126 ms | 126 ms |
| Indexed search documents | 3,801 | 7,601 |
| Pending outbox rows | 8,303 | 16,603 |
| Integrity / FK violations | ok / 0 | ok / 0 |

Interpretation: per-record cost is dominated by the deliberate durability work (audit row, outbox row, search projection, `synchronous=FULL`) at roughly **1.5–4.9 ms per record** on this host. Query paths stay in the low milliseconds at these scales. The numbers are a baseline, not a service-level guarantee; a phone will be slower and should be measured separately.

## Not executed (deferred, not claimed)

| Area | Why deferred |
| --- | --- |
| Real network sync / remote apply | Transport is explicitly out of scope; only local outbox/conflict metadata exists. |
| IndexedDB engine / PWA profile | Implemented 2026-10-18: 15 engine tests + 3 parity tests + real Chromium restart/offline test. See `docs/local-storage-report.md`. |
| Android/iOS packaging and SQLite embedding | No mobile shell in this phase. |
| Encryption / SQLCipher / key management | Not implemented; no encryption is claimed. |
| Multi-process write contention stress | Single-process design and busy timeout are configured; no sustained contention test yet. |
| Attachments backup (binary files) | Only the inventory count and warning are implemented. |
| Very large datasets (>100k rows) | Benchmark covers up to 2,000 clients and ~7,600 indexed documents. |
| Restore onto different hardware / identity rotation flow | `rotateIdentity` exists in the device service but is not exercised end-to-end yet. |
