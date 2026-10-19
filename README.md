# مِداد — Law Office Management

Arabic-first (RTL) law-office management app for Egyptian practice, running entirely on the local device. The interface is built on the existing offline-first data foundation: **SQLite** for desktop/CLI and **IndexedDB** for the installable PWA. No server, no cloud, no AI, no paid services, no CDN — the app can be deployed as a static bundle. **The case-system work on this branch has not been merged or deployed.** The earlier deployment URL is https://ahmedmo111269.github.io/law-office/.

- Branch: `arena/da2efbff-law-office` (baseline `main` at `8e49d7c`); app/package/CLI version **0.3.0**
- Schema: **v2** · 59 application tables · 187 indexes · 194 checks · 172 foreign keys · 58 lookup lists / 505 reference items. Applied v1 definitions/checksums are frozen.
- Verification: **80/80** data-layer tests, **81/81** case-UI checks, **32/32** existing UI assertions and **61/61** route/responsive checks; see the dated report for commands and limits.
- Real Chromium: actual v1→v2 versionchange, unchanged old IDs/ledger, restart/persistence and offline reads/writes (`npm run test:browser`).
- Real case benchmarks: 10k and 100k on SQLite and Chromium IndexedDB; no fake-IDB performance numbers. At 100k the first 25 rows measured 12.94 ms / 704.6 ms; broad subject filtering still took 682 ms / 3976.4 ms.
- Engines: SQLite for desktop/CLI; IndexedDB for the PWA; the case workflow uses shared portable semantics. No cloud sync or multiuser permission system is implemented.

## منظومة القضايا الجديدة

- [التقرير التفصيلي: 20 بندًا](docs/case-system-report.md)
- [دليل الاستخدام والترقية والتعافي](docs/case-system-guide.md)
- [القياسات الفعلية والبيانات الخام وحدودها](docs/case-system-performance.md)
- [قاموس بيانات v2 المولد](docs/schema-v2.md)؛ [قاموس v1 التاريخي](docs/schema.md) محفوظ دون إعادة كتابة.

ملف نزاع قبل القيد، قوالب شرطية بإصدارات، تصنيف قابل للتوسيع، أطراف وصفات مستقلة لكل درجة، مراحل سابقة وقضائية اختيارية، سجل إجراءات، جهات ودوائر موحدة، قاموس موضوعات وأسماء بديلة ودمج يدوي، بحث وفلاتر بعدّ دقيق، وتخصيص عبر التفضيلات الحالية. لا تُنشأ دعوى أو مرحلة تالية تلقائيًا، ولا تُحسب مواعيد طعن أو تقادم.

## إذا ظهرت صفحة README بدل البرنامج

هذا خلل في **مصدر نشر GitHub Pages**، وليس في قاعدة البيانات. الحل الدائم لصاحب المستودع:

1. افتح [Settings → Pages](https://github.com/ahmedmo111269/law-office/settings/pages).
2. تحت **Build and deployment → Source** اختر **GitHub Actions** بدل **Deploy from a branch**.
3. بعد دمج إصلاح النشر في `main`، افتح **Actions → Deploy PWA to GitHub Pages → Run workflow** على `main` وانتظر نجاح النشر.
4. افتح https://ahmedmo111269.github.io/law-office/ وأعد تحميل الصفحة. يجب أن يظهر عنوان «مِداد — إدارة مكتب المحاماة»، لا صفحة README.

النشر الصحيح يرفع محتويات `dist/` التي ينتجها `npm run build:web`، وليس جذر المستودع أو مجلد `web/` وحده. يتضمن مسار النشر انتظار انتهاء نشر Pages القديم عند استمرار استخدامه، لمنعه من استبدال التطبيق بصفحة README. إذا انتهت مهلة الانتظار، غيّر Source كما سبق وأعد تشغيل النشر.

**لا تمسح بيانات الموقع أو IndexedDB لمعالجة هذه المشكلة**؛ فقد تحتوي على بيانات المكتب المحلية. لا يتطلب إصلاح النشر حذف أي بيانات.

## Quick start

```bash
npm install
npm run build:web      # bundle the PWA into dist/
npm run serve:web      # http://127.0.0.1:4173/law-office/

npm run typecheck
npm run typecheck:tests
npm test
npm run test:ui        # 20 UI → IndexedDB scenarios in headless Chromium
npm run test:smoke     # routes + dialogs + responsive layouts (requires dist/)
npm run test:ui:cases  # case forms/procedures/privacy; 320/360/390/430/768/1024/1280/1440
npm run test:browser   # real v1 upgrade + browser restart + offline storage

npm run db:init   -- --db data/office.sqlite
npm run db:check  -- --db data/office.sqlite
npm run db:info   -- --db data/office.sqlite
npm run db:backup -- --db data/office.sqlite --label initial
```

`data/` and `*.sqlite` are ignored by Git. Do not put real client data in a development checkout.

## The application

- Arabic RTL interface, local fonts (IBM Plex Sans Arabic + Amiri), light/dark themes and density settings.
- 24 routes: office day, tasks, appointments, files (with the full case-file page), clients, parties, cases, hearings, judgments, execution, announcements, documents, contracts/POAs, finance, reports, archive, settings and global search.
- Reusable component library: advanced data table (column show/hide/reorder/resize/pin, density, saved views, bulk actions), dialogs, forms, pickers, menus, toasts, empty/loading states.
- Every write goes through `src/ui/services` → `PortableLawOffice` → `DatabaseAdapter`; no `localStorage` shadow store and no invented sample data.
- Offline-first PWA with a service worker and precache manifest; data lives in IndexedDB and survives reloads and browser restarts.
- UI tests drive the built app in Chromium and assert rows by reading IndexedDB directly.
- Design system and page inventory: [`docs/ui-design-system.md`](docs/ui-design-system.md).

## What exists

- Frozen v1 DDL/seed plus an additive v2 migration: parties/persons/organisations, files/cases/courts, hearings/judgments, tasks/announcements, documents/versions/links, contracts/POAs, operational finance, appointments/reminders, audit, deletion batches, sync metadata, Arabic search.
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
| [`docs/schema-v2.md`](docs/schema-v2.md) | Current generated data dictionary; `docs/schema.md` remains the historical v1 dictionary |
| [`docs/migrations.md`](docs/migrations.md) | Migration mechanism, adding v2, recovery |
| [`docs/backup-restore.md`](docs/backup-restore.md) | Backup/restore interface, WAL safety, attachments, limits |
| [`docs/sync-readiness.md`](docs/sync-readiness.md) | Outbox, conflict metadata, policies, what is missing |
| [`docs/testing.md`](docs/testing.md) | How to run tests/CLI/benchmark, troubleshooting |
| [`docs/test-results.md`](docs/test-results.md) | Executed results, 20-scenario coverage, deferred tests |
| [`docs/benchmark-results.md`](docs/benchmark-results.md) | Recorded load-test numbers |
| [`docs/limits-and-decisions.md`](docs/limits-and-decisions.md) | Issues, risks, pending approvals, explicitly not implemented |
| [`docs/final-report.md`](docs/final-report.md) | Phase-1 report: repo state, deliverables, results, next step |
| [`docs/ui-design-system.md`](docs/ui-design-system.md) | Design system: tokens, typography, IA, components, responsive, accessibility |
| [`docs/final-report-ui.md`](docs/final-report-ui.md) | Phase-2 delivery report: UI, wiring, tests, offline, published URL, limits |
| [`docs/local-storage-implementation.md`](docs/local-storage-implementation.md) | How SQLite and IndexedDB actually store data, constraint mapping, migration and backup design |
| [`docs/local-storage-report.md`](docs/local-storage-report.md) | Delivery report: engines, files, executed results, restart/offline proof, limits, engine differences |

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
npm test                   # 80 tests (SQLite + IndexedDB + parity)
npm run test:idb           # IndexedDB engine + cross-engine parity only
npm run test:browser       # real Chromium restart + offline storage test
npm run db:bench -- --scale=1
npm run db:gen-manifest    # regenerate required-schema manifest
npm run db:gen-schema      # regenerate docs/schema-v2.md (preserves historical v1 docs)
npm run db:gen-portable    # regenerate the current v2 descriptor + restore metadata
npm run db:bench:cases -- --engine=indexeddb --count=100000  # disposable synthetic data only
```
