/**
 * Real-browser offline self-test used by `npm run test:browser`.
 *
 * Two phases share one persistent browser profile and therefore one real
 * on-disk IndexedDB database:
 *   ?phase=write   — first run: create the office data and a backup
 *   ?phase=verify  — second run after the browser process was restarted:
 *                    prove persistence, relations, search, backup and that
 *                    storage keeps working with the network switched off.
 */
import { realBrowserCaseUpgrade } from './browser-case-upgrade.ts';
import { openBrowserDatabase } from '../src/browser/browser-database.ts';
import type { PortableBackup } from '../src/portable/portable-database.ts';

interface SelfTestResult {
  phase: string;
  engine: string;
  userAgent: string;
  personId?: string;
  fileId?: string;
  caseId?: string;
  counts?: Record<string, number>;
  caseUpgrade?: Awaited<ReturnType<typeof realBrowserCaseUpgrade>>;
  backupValid?: boolean;
  backupRows?: number;
  backupBytes?: number;
  searchHits?: number;
  relations?: {
    fileParties: number;
    caseHearings: number;
    judgmentFiles: number;
  };
  integrity?: {
    ok: boolean;
    errors: string[];
    tables: number;
    indexes: number;
  };
  offline?: {
    externalFetchFailed: boolean;
    writeSucceeded: boolean;
    readAfterWrite: boolean;
  };
  migrations?: { valid: boolean; version: number };
  error?: string;
}

declare global {
  interface Window {
    __lawoResult?: SelfTestResult;
  }
}

const DB_NAME = 'law-office-browser-selftest';
const BACKUP_KEY = 'lawo.selftest.backup';

function phase(): string {
  return new URLSearchParams(location.search).get('phase') ?? 'write';
}

function personName(value: unknown): string {
  return JSON.stringify(value);
}

async function writePhase(): Promise<SelfTestResult> {
  const caseUpgrade = await realBrowserCaseUpgrade();
  const handle = await openBrowserDatabase({
    name: DB_NAME,
    appVersion: '0.1.0-browser',
    deviceLabel: 'Chrome',
  });
  const { db } = handle;
  const person = (await db.createPerson({
    firstName: 'سلمى',
    middleName: 'عبد الله',
    lastName: 'النجار',
    nationalId: '29501011234567',
  })) as unknown as { party: Record<string, string> };
  await db.addContact(String(person.party.id), {
    typeCode: 'phone',
    value: '01012345678',
    isPrimary: true,
  });
  const court = await db.createCourt({ name: 'محكمة بنها الابتدائية' });
  const file = await db.createFile({
    title: 'قضية تعويض عن حادث',
    clientPartyIds: [String(person.party.id)],
    practiceAreaCode: 'civil',
  });
  const legalCase = await db.createCase({
    caseNumber: '2026-441',
    caseYear: 2026,
    courtId: String(court.id),
    fileIds: [String(file.id)],
  });
  const hearing = await db.scheduleHearing({
    caseId: String(legalCase.id),
    scheduledAt: '2026-11-12T09:00:00.000Z',
  });
  await db.recordHearing(String(hearing.id), {
    outcomeSummary: 'تم التأجيل لجلسة قادمة',
  });
  await db.scheduleNextHearing(String(hearing.id), {
    scheduledAt: '2026-12-10T09:00:00.000Z',
  });
  await db.recordJudgment({
    caseId: String(legalCase.id),
    issuedOn: '2026-10-01',
    judgmentTypeCode: 'preliminary',
    operativePart: 'إلزام المدعى عليه بالتعويض',
    fileIds: [String(file.id)],
  });
  const task = await db.createTask({
    title: 'إعداد مذكرة الطعن',
    caseId: String(legalCase.id),
    fileId: String(file.id),
    dueAt: '2026-11-20T12:00:00.000Z',
  });
  await db.changeTaskStatus(String(task.id), 'completed', {
    resultSummary: 'تمت المراجعة',
  });
  const document = await db.registerDocument({
    title: 'محضر الحادث',
    docTypeCode: 'evidence',
    fileId: String(file.id),
  });
  await db.addDocumentVersion(String(document.id), {
    fileName: 'accident-report.pdf',
    storageKind: 'local_file',
    storagePath: 'files/2026/accident-report.pdf',
    byteSize: 2048,
    checksumSha256: 'b'.repeat(64),
  });
  const account = await db.createAccount({
    name: 'خزينة المكتب',
    kindCode: 'cash',
    openingBalanceMinor: 0,
  });
  const charge = await db.createCharge({
    clientPartyId: String(person.party.id),
    fileId: String(file.id),
    description: 'أتعاب المحاماة',
    amountMinor: 750000,
  });
  const payment = await db.postTransaction({
    accountId: String(account.id),
    direction: 'in',
    amountMinor: 250000,
    clientPartyId: String(person.party.id),
    fileId: String(file.id),
    description: 'دفعة تحت الحساب',
  });
  await db.allocate(String(payment.id), String(charge.id), 250000);

  const backup = await db.exportBackup();
  const verification = await db.verifyBackup(backup);
  window.localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
  const integrity = await handle.indexedDb.integrityCheck();
  const migrations = await handle.migrations.verify();
  const counts = await db.stats();
  const result: SelfTestResult = {
    phase: 'write',
    caseUpgrade,
    engine: handle.engine,
    userAgent: navigator.userAgent,
    personId: String(person.party.id),
    fileId: String(file.id),
    caseId: String(legalCase.id),
    counts,
    backupValid: verification.valid,
    backupRows: verification.totalRows,
    backupBytes: JSON.stringify(backup).length,
    integrity,
    migrations: { valid: migrations.valid, version: migrations.currentVersion },
  };
  await handle.close();
  return result;
}

async function verifyPhase(): Promise<SelfTestResult> {
  const handle = await openBrowserDatabase({
    name: DB_NAME,
    appVersion: '0.1.0-browser',
    deviceLabel: 'Chrome',
  });
  const { db } = handle;
  const hits = await db.search('سلمى', { entityType: 'party' });
  if (hits.length === 0)
    throw new Error('persisted party is not searchable after restart');
  const personId = hits[0]!.entityId;
  const files = await db.list('case_file', {
    where: { title: 'قضية تعويض عن حادث' },
  });
  if (files.length === 0)
    throw new Error('persisted file is missing after restart');
  const fileId = String(files[0]!.id);
  const fileFull = await db.getFileFull(fileId);
  const legalCases = await db.list('legal_case', {
    where: { case_number: '2026-441' },
  });
  if (legalCases.length === 0)
    throw new Error('persisted case is missing after restart');
  const caseFull = await db.getCaseFull(String(legalCases[0]!.id));
  const judgments = await db.list('judgment', {
    where: { case_id: String(legalCases[0]!.id) },
  });
  const judgmentFull = judgments[0]
    ? await db.getJudgmentFull(String(judgments[0].id))
    : null;
  const migrations = await handle.migrations.verify();
  const integrity = await handle.indexedDb.integrityCheck();

  // Re-verify the backup written by the first browser process.
  const stored = window.localStorage.getItem(BACKUP_KEY);
  if (!stored) throw new Error('backup from the first run is missing');
  const verification = await db.verifyBackup(
    JSON.parse(stored) as PortableBackup,
  );

  // Offline behaviour: the harness switches the browser network off before
  // calling this phase; storage must keep working with no network requests.
  let externalFetchFailed = false;
  try {
    await fetch('https://example.com/lawo-offline-probe', {
      method: 'GET',
      cache: 'no-store',
    });
  } catch {
    externalFetchFailed = true;
  }
  const offlineTask = await db.createTask({
    title: 'مهمة أثناء انقطاع الشبكة',
    dueAt: '2026-12-01T09:00:00.000Z',
  });
  const readBack = await db.get('task', String(offlineTask.id));
  const offlineResult = {
    externalFetchFailed,
    writeSucceeded: readBack !== undefined,
    readAfterWrite: readBack?.title === 'مهمة أثناء انقطاع الشبكة',
  };

  const counts = await db.stats();
  const result: SelfTestResult = {
    phase: 'verify',
    engine: handle.engine,
    userAgent: navigator.userAgent,
    personId: String(personId),
    fileId,
    caseId: String(legalCases[0]!.id),
    counts,
    backupValid: verification.valid,
    backupRows: verification.totalRows,
    backupBytes: stored.length,
    searchHits: hits.length,
    relations: {
      fileParties: fileFull?.parties.length ?? 0,
      caseHearings: caseFull.hearings.length,
      judgmentFiles: judgmentFull?.files.length ?? 0,
    },
    integrity,
    migrations: { valid: migrations.valid, version: migrations.currentVersion },
    offline: offlineResult,
  };
  await handle.close();
  return result;
}

async function main(): Promise<void> {
  try {
    const current = phase();
    const result =
      current === 'verify' ? await verifyPhase() : await writePhase();
    window.__lawoResult = result;
    document.body.textContent = personName(result);
  } catch (error) {
    window.__lawoResult = {
      phase: phase(),
      engine: 'indexeddb',
      userAgent: navigator.userAgent,
      error:
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error),
    };
    document.body.textContent = window.__lawoResult.error ?? 'unknown error';
  }
}

void main();
