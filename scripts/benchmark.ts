/**
 * Local load benchmark. Run against a throwaway database file:
 *   node --disable-warning=ExperimentalWarning scripts/benchmark.ts --scale=1
 * Results are printed as JSON; the checked-in summary is docs/benchmark-results.md.
 */
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LawOfficeDatabase } from '../src/app/law-office-database.ts';
import { SystemClock } from '../src/util/clock.ts';

const args = new Map(
  process.argv
    .slice(2)
    .filter((value) => value.startsWith('--'))
    .map((value) => {
      const [key, raw] = value.slice(2).split('=', 2) as [string, string | undefined];
      return [key, raw ?? 'true'] as const;
    }),
);
const scale = Math.max(1, Number(args.get('scale') ?? 1));
const path = resolve(args.get('db') ?? 'data/benchmark.sqlite');
rmSync(path, { force: true });
rmSync(`${path}-wal`, { force: true });
rmSync(`${path}-shm`, { force: true });
mkdirSync(dirname(path), { recursive: true });

const clients = Math.round(1000 * scale);
const files = Math.round(500 * scale);
const cases = Math.round(500 * scale);
const hearings = Math.round(1000 * scale);
const tasks = Math.round(500 * scale);
const documents = Math.round(300 * scale);
const payments = Math.round(300 * scale);

const startedAt = Date.now();
const { database: db } = LawOfficeDatabase.open({
  path,
  clock: new SystemClock(),
  appVersion: '0.1.0-bench',
  deviceLabel: 'benchmark',
  backupDir: `${path}.backups`,
});
const timings: Record<string, { count: number; ms: number; perRecordMs: number }> = {};
function phase<T>(name: string, count: number, action: () => T): T {
  const start = Date.now();
  const value = action();
  const ms = Date.now() - start;
  timings[name] = { count, ms, perRecordMs: count === 0 ? 0 : Number((ms / count).toFixed(3)) };
  process.stderr.write(`${name}: ${count} in ${ms} ms\n`);
  return value;
}

const courtId = phase('court', 1, () =>
  db.courts.createCourt({ name: 'محكمة القاهرة الجديدة', courtKindCode: 'primary' }).id,
);

const clientRecords = phase('clients', clients, () => {
  const rows = [];
  for (let index = 0; index < clients; index += 1) {
    rows.push(
      db.parties.createClientPerson(
        {
          firstName: 'أحمد',
          middleName: 'محمد',
          lastName: `الموكل ${index}`,
          nationalId: `29${String(index).padStart(12, '0')}`,
        },
        { sourceCode: 'referral' },
      ),
    );
  }
  return rows;
});

const fileRecords = phase('files', files, () => {
  const rows = [];
  for (let index = 0; index < files; index += 1) {
    const client = clientRecords[index % clientRecords.length]!;
    rows.push(
      db.caseFiles.create({
        title: `ملف تجريبي ${index}`,
        fileTypeCode: 'primary',
        practiceAreaCode: index % 2 === 0 ? 'civil' : 'commercial',
        clientPartyIds: [client.party.id],
      }),
    );
  }
  return rows;
});

const caseRecords = phase('cases', cases, () => {
  const rows = [];
  for (let index = 0; index < cases; index += 1) {
    const file = fileRecords[index % fileRecords.length]!;
    rows.push(
      db.cases.create({
        fileIds: [file.id],
        courtId,
        caseNumber: String(1000 + index),
        caseYear: 2026,
        caseTypeCode: index % 2 === 0 ? 'civil' : 'commercial',
        subject: `موضوع القضية ${index}`,
      }),
    );
  }
  return rows;
});

phase('hearings', hearings, () => {
  for (let index = 0; index < hearings; index += 1) {
    const legalCase = caseRecords[index % caseRecords.length]!;
    db.hearings.schedule({
      caseId: legalCase.id,
      scheduledAt: new Date(Date.UTC(2026, 10, 1 + (index % 27), 9, 0, 0)).toISOString(),
      purpose: 'first_session',
    });
  }
});

phase('tasks', tasks, () => {
  for (let index = 0; index < tasks; index += 1) {
    const legalCase = caseRecords[index % caseRecords.length]!;
    const file = fileRecords[index % fileRecords.length]!;
    db.tasks.create({
      title: `مهمة ${index}`,
      taskTypeCode: 'follow_up',
      fileId: file.id,
      caseId: legalCase.id,
      dueAt: new Date(Date.UTC(2026, 10, 2 + (index % 26), 12, 0, 0)).toISOString(),
    });
  }
});

const accountId = phase('account', 1, () =>
  db.finance.createAccount({ name: 'خزنة رئيسية', kindCode: 'cash', openingBalanceMinor: 0 }).id,
);
phase('finance', payments, () => {
  db.db.transaction(() => {
    for (let index = 0; index < payments; index += 1) {
      const client = clientRecords[index % clientRecords.length]!;
      const file = fileRecords[index % fileRecords.length]!;
      const charge = db.finance.createCharge({
        clientPartyId: client.party.id,
        fileId: file.id,
        description: `مستحق ${index}`,
        amountMinor: 100_000 + index,
        dueOn: '2026-11-30',
      });
      const payment = db.finance.postTransaction({
        accountId,
        direction: 'in',
        amountMinor: 100_000 + index,
        clientPartyId: client.party.id,
        fileId: file.id,
        occurredAt: '2026-11-02T10:00:00.000Z',
        methodCode: 'cash',
      });
      db.finance.allocate(payment.id, charge.id, 100_000 + index);
    }
  });
});

phase('documents', documents, () => {
  for (let index = 0; index < documents; index += 1) {
    const file = fileRecords[index % fileRecords.length]!;
    const document = db.documents.register({
      title: `مستند ${index}`,
      docTypeCode: 'pleading',
      docDate: '2026-10-01',
    });
    db.documents.link(document.id, { kind: 'file', id: file.id });
  }
});

const searchStart = Date.now();
const searchHits = db.search.search('احمد', { limit: 50 });
const searchMs = Date.now() - searchStart;
const listStart = Date.now();
const listedFiles = db.caseFiles.listFiles({ limit: 50 });
const listMs = Date.now() - listStart;
const upcomingStart = Date.now();
const upcoming = db.hearings.upcoming('2026-11-01T00:00:00.000Z', 50);
const upcomingMs = Date.now() - upcomingStart;
const integrityStart = Date.now();
const health = db.health.schemaCheck();
const integrityMs = Date.now() - integrityStart;
const stats = db.health.stats();
const engine = db.db.describe();
db.close();

const result = {
  scale,
  path,
  counts: {
    clients,
    files,
    cases,
    hearings,
    tasks,
    documents,
    payments,
  },
  timings,
  queries: {
    searchMs,
    searchHits: searchHits.length,
    listFilesMs: listMs,
    listedFiles: listedFiles.length,
    upcomingMs,
    upcoming: upcoming.length,
    integrityMs,
  },
  health: {
    ok: health.ok,
    integrity: health.integrity,
    foreignKeyViolations: health.foreignKeyViolations.length,
    searchDocuments: stats.searchDocuments,
    pendingSyncChanges: stats.pendingSyncChanges,
  },
  fileSizeBytes: statSync(path).size,
  totalMs: Date.now() - startedAt,
  node: process.version,
  engine,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
