import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LawOfficeDatabase } from '../src/app/law-office-database.ts';
import type { CaseFileRecord } from '../src/repositories/case-file-repository.ts';
import type { LegalCaseRecord } from '../src/repositories/case-repository.ts';
import type { PartyFull } from '../src/repositories/party-repository.ts';
import { FixedClock } from '../src/util/clock.ts';

let counter = 0;
let clientSequence = 0;

export interface TestHarness {
  readonly db: LawOfficeDatabase;
  readonly dir: string;
  readonly path: string;
  readonly clock: FixedClock;
  close(): void;
  cleanup(): void;
}

export function openHarness(label = 'test'): TestHarness {
  counter += 1;
  const dir = mkdtempSync(join(tmpdir(), `lawo-${label}-${counter}-`));
  const path = join(dir, 'office.sqlite');
  const clock = new FixedClock('2026-10-18T09:00:00.000Z');
  const { database } = LawOfficeDatabase.open({
    path,
    clock,
    appVersion: '0.1.0-test',
    deviceLabel: `test-${label}`,
    backupDir: join(dir, 'backups'),
  });
  return {
    db: database,
    dir,
    path,
    clock,
    close: () => database.close(),
    cleanup: () => {
      database.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function makeClient(
  db: LawOfficeDatabase,
  lastName = 'العلي',
  nationalId?: string,
): PartyFull {
  clientSequence += 1;
  return db.parties.createClientPerson(
    {
      firstName: 'أحمد',
      middleName: 'محمد',
      lastName,
      nationalId: nationalId ?? `2900101${String(clientSequence).padStart(7, '0')}`,
    },
    { sourceCode: 'referral' },
  );
}

export function makeCourt(db: LawOfficeDatabase, name = 'محكمة القاهرة الجديدة'): string {
  return db.courts.createCourt({ name, courtKindCode: 'primary' }).id;
}

export function makeFile(
  db: LawOfficeDatabase,
  clientPartyIds: readonly string[] = [],
  title = 'ملف تجريبي',
): CaseFileRecord {
  return db.caseFiles.create({
    title,
    fileTypeCode: 'primary',
    ...(clientPartyIds.length === 0 ? {} : { clientPartyIds: [...clientPartyIds] }),
  });
}

export function makeCase(
  db: LawOfficeDatabase,
  fileId: string | undefined,
  courtId: string | undefined,
  caseNumber = '123',
  caseYear = 2026,
): LegalCaseRecord {
  return db.cases.create({
    ...(fileId === undefined ? {} : { fileIds: [fileId] }),
    ...(courtId === undefined ? {} : { courtId }),
    caseNumber,
    caseYear,
    caseTypeCode: 'civil',
  });
}
