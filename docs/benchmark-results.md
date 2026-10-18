# Local load benchmark — recorded results

Run date **2026‑10‑18** on the development host (Linux x64, Node v22.22.3, SQLite 3.51.3). Single process, file-backed database, WAL, `synchronous=FULL`, FTS5 enabled. These are baseline measurements, not capacity guarantees.

Command:

```bash
node --disable-warning=ExperimentalWarning scripts/benchmark.ts --scale=1 --db=data/benchmark.sqlite
node --disable-warning=ExperimentalWarning scripts/benchmark.ts --scale=2 --db=data/benchmark2.sqlite
```

Scale 1 creates 1,000 clients, 500 files, 500 cases, 1,000 hearings, 500 tasks, 300 documents, 300 charge/payment/allocation sets.

| Metric | Scale 1 | Scale 2 |
| --- | --- | --- |
| Total | 13,497 ms | 24,751 ms |
| File size | 23.8 MiB | 46.6 MiB |
| Clients | 4,623 ms · 4.623 ms/rec | 8,606 ms · 4.303 ms/rec |
| Files | 2,451 ms · 4.902 ms/rec | 4,348 ms · 4.348 ms/rec |
| Cases | 2,040 ms · 4.080 ms/rec | 3,812 ms · 3.812 ms/rec |
| Hearings | 1,519 ms · 1.519 ms/rec | 2,882 ms · 1.441 ms/rec |
| Tasks | 798 ms · 1.596 ms/rec | 1,474 ms · 1.474 ms/rec |
| Finance | 918 ms · 3.060 ms/rec | 1,503 ms · 2.505 ms/rec |
| Documents | 948 ms · 3.160 ms/rec | 1,760 ms · 2.933 ms/rec |
| Arabic search (50) | 5 ms | 18 ms |
| List files (50) | 1 ms | 1 ms |
| Upcoming hearings (50) | 1 ms | 1 ms |
| Schema + integrity check | 126 ms | 126 ms |
| Search documents | 3,801 | 7,601 |
| Pending outbox rows | 8,303 | 16,603 |
| Integrity / FK violations | ok / 0 | ok / 0 |

## Observations

- Write cost is dominated by durability and traceability: one transaction per operation, an audit row, an outbox row, and a derived search document. This is intentional for a legal office. Bulk import should use a dedicated, reviewed batching path rather than weakening these guarantees.
- Read/query paths stay in the low milliseconds at these sizes.
- Database growth is roughly 24 KiB per client-equivalent record at this mix; hearings/tasks are smaller.
- A phone is slower; repeat the benchmark on each target device before setting expectations.
- No 100k-row test has been run. There are no arbitrary record caps in the code; pagination is required by list APIs (`limit`, `offset`), and the benchmark itself uses limits for queries.
