# مِداد — Law Office Management

Arabic-first (RTL) law-office management app for Egyptian practice, running entirely on the local device. The interface is built on the existing offline-first data foundation: **SQLite** for desktop/CLI and **IndexedDB** for the installable PWA. No server, no cloud, no AI, no paid services, no CDN — the published app is a static bundle at **https://ahmedmo111269.github.io/law-office/**.

- Branch: `arena/7c319720-law-office` (baseline `main` at `409f359`)
- Schema: **v1** · 57 application tables · 90 indexes · 16 triggers · 54 lookup lists / 374 reference items
- Tests: **47/47 passing** (`node:test`) plus **32/32** UI→IndexedDB assertions and **61/61** route/responsive checks
- Real-browser test: Chromium 153 restarts with a persistent profile and reads back IndexedDB data with the network disabled (`npm run test:browser`)
- Engines: SQLite for desktop/native (unchanged); IndexedDB for the PWA; shared portable write semantics and documented differences

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
npm run test:smoke     # 22 routes + dialogs + 320…1440 layouts

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
npm test                   # 39 tests (SQLite + IndexedDB + parity)
npm run test:idb           # IndexedDB engine + cross-engine parity only
npm run test:browser       # real Chromium restart + offline storage test
npm run db:bench -- --scale=1
npm run db:gen-manifest    # regenerate required-schema manifest
npm run db:gen-schema      # regenerate docs/schema.md
npm run db:gen-portable    # regenerate the portable schema + seed from the migrated SQLite schema
```
