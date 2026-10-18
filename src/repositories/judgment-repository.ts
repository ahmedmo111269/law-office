import type { SqlRow } from '../db/adapter.ts';
import { NotFoundError, ValidationError } from '../errors.ts';
import { getSyncEntity } from '../sync/entity-registry.ts';
import { assertIsoDate } from '../util/dates.ts';
import { BaseRepository, type EntityRecord, type RepositoryDependencies } from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';

export interface JudgmentRecord extends EntityRecord {
  readonly case_id: string;
  readonly hearing_id: string | null;
  readonly court_id: string | null;
  readonly judgment_number: string | null;
  readonly issued_on: string;
  readonly judgment_type_id: string | null;
  readonly status_id: string | null;
  readonly operative_part: string | null;
  readonly reasoning: string | null;
  readonly deposit_date: string | null;
  readonly copy_received_on: string | null;
  readonly user_appeal_deadline: string | null;
  readonly appeal_notes: string | null;
  readonly notes: string | null;
}

export interface RecordJudgmentInput {
  caseId: string;
  hearingId?: string;
  courtId?: string;
  judgmentNumber?: string;
  issuedOn: string;
  judgmentTypeCode?: string;
  statusCode?: string;
  operativePart?: string;
  reasoning?: string;
  depositDate?: string;
  copyReceivedOn?: string;
  /** Explicitly entered by the user; the system never derives legal deadlines. */
  userAppealDeadline?: string;
  appealNotes?: string;
  notes?: string;
  fileIds?: readonly string[];
}

export class JudgmentRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly judgments: BaseRepository<JudgmentRecord>;
  private readonly judgmentFiles: BaseRepository<EntityRecord>;
  private readonly appeals: BaseRepository<EntityRecord>;

  constructor(deps: RepositoryDependencies, lookups: LookupRepository) {
    this.deps = deps;
    this.lookups = lookups;
    this.judgments = new BaseRepository<JudgmentRecord>(deps, getSyncEntity('judgment'));
    this.judgmentFiles = new BaseRepository(deps, getSyncEntity('judgment_file_link'));
    this.appeals = new BaseRepository(deps, getSyncEntity('judgment_appeal'));
  }

  record(input: RecordJudgmentInput): JudgmentRecord {
    const legalCase = this.requireCase(input.caseId);
    assertIsoDate(input.issuedOn, 'issuedOn');
    if (input.depositDate) assertIsoDate(input.depositDate, 'depositDate');
    if (input.copyReceivedOn) assertIsoDate(input.copyReceivedOn, 'copyReceivedOn');
    if (input.userAppealDeadline) assertIsoDate(input.userAppealDeadline, 'userAppealDeadline');

    if (input.hearingId) {
      const hearing = this.deps.db.get<{ case_id: string }>(
        'SELECT case_id FROM hearing WHERE id = ? AND deleted_at IS NULL',
        [input.hearingId],
      );
      if (!hearing) throw new NotFoundError('hearing', input.hearingId);
      if (hearing.case_id !== input.caseId) {
        throw new ValidationError('hearing does not belong to the case');
      }
    }
    const courtId = input.courtId ?? (legalCase.court_id as string | null);
    if (courtId && !this.deps.db.get('SELECT id FROM court WHERE id = ?', [courtId])) {
      throw new NotFoundError('court', courtId);
    }

    return this.deps.db.transaction(() => {
      const judgment = this.judgments.insert({
        case_id: input.caseId,
        hearing_id: input.hearingId ?? null,
        court_id: courtId,
        judgment_number: input.judgmentNumber?.trim() || null,
        issued_on: input.issuedOn,
        judgment_type_id: this.lookups.resolveOptional('judgment_type', input.judgmentTypeCode),
        status_id: this.lookups.requireItemByCode(
          'judgment_status',
          input.statusCode ?? 'issued',
          'judgment status',
        ).id,
        operative_part: input.operativePart ?? null,
        reasoning: input.reasoning ?? null,
        deposit_date: input.depositDate ?? null,
        copy_received_on: input.copyReceivedOn ?? null,
        user_appeal_deadline: input.userAppealDeadline ?? null,
        appeal_notes: input.appealNotes ?? null,
        notes: input.notes ?? null,
      });

      const fileIds =
        input.fileIds ??
        this.deps.db
          .query<{ file_id: string }>(
            'SELECT file_id FROM case_file_case WHERE case_id = ? AND deleted_at IS NULL',
            [input.caseId],
          )
          .map((row) => row.file_id);
      for (const fileId of fileIds) {
        this.requireFile(fileId);
        this.judgmentFiles.insert({
          judgment_id: judgment.id,
          file_id: fileId,
          notes: null,
        });
      }
      return judgment;
    });
  }

  recordAppeal(
    judgmentId: string,
    input: {
      appealTypeCode: string;
      filedOn?: string;
      userDeadlineOn?: string;
      statusCode?: string;
      referenceNo?: string;
      notes?: string;
    },
  ): EntityRecord {
    this.judgments.requireById(judgmentId);
    if (input.filedOn) assertIsoDate(input.filedOn, 'filedOn');
    if (input.userDeadlineOn) assertIsoDate(input.userDeadlineOn, 'userDeadlineOn');
    return this.appeals.insert({
      judgment_id: judgmentId,
      appeal_type_id: this.lookups.requireItemByCode('appeal_type', input.appealTypeCode).id,
      filed_on: input.filedOn ?? null,
      user_deadline_on: input.userDeadlineOn ?? null,
      status_id: this.lookups.requireItemByCode(
        'appeal_status',
        input.statusCode ?? 'pending',
        'appeal status',
      ).id,
      reference_no: input.referenceNo ?? null,
      notes: input.notes ?? null,
    });
  }

  getJudgment(id: string): JudgmentRecord {
    return this.judgments.requireById(id);
  }

  listForCase(caseId: string): JudgmentRecord[] {
    return this.judgments.list({
      filters: [{ column: 'case_id', value: caseId }],
      limit: 200,
      orderBy: { column: 'issued_on', direction: 'desc' },
    });
  }

  getFull(id: string): {
    judgment: JudgmentRecord;
    files: ReadonlyArray<SqlRow>;
    appeals: ReadonlyArray<SqlRow>;
  } {
    const judgment = this.judgments.requireById(id);
    const files = this.deps.db.query<SqlRow>(
      `SELECT f.id, f.file_number, f.title FROM judgment_file_link l
       JOIN case_file f ON f.id = l.file_id
       WHERE l.judgment_id = ? AND l.deleted_at IS NULL`,
      [id],
    );
    const appeals = this.deps.db.query<SqlRow>(
      `SELECT a.*, t.name_ar AS appeal_type_name FROM judgment_appeal a
       LEFT JOIN lookup_item t ON t.id = a.appeal_type_id
       WHERE a.judgment_id = ? AND a.deleted_at IS NULL
       ORDER BY a.created_at`,
      [id],
    );
    return { judgment, files, appeals };
  }

  softDelete(id: string, reason?: string): { batchId: string; affectedCount: number } {
    return this.judgments.softDelete(id, { ...(reason === undefined ? {} : { reason }) });
  }

  restore(id: string): { batchId: string | null; restoredCount: number } {
    return this.judgments.restore(id);
  }

  private requireCase(caseId: string): SqlRow {
    const row = this.deps.db.get<SqlRow>(
      'SELECT id, court_id FROM legal_case WHERE id = ? AND deleted_at IS NULL',
      [caseId],
    );
    if (!row) throw new NotFoundError('legal_case', caseId);
    return row;
  }

  private requireFile(fileId: string): void {
    if (!this.deps.db.get('SELECT id FROM case_file WHERE id = ? AND deleted_at IS NULL', [fileId])) {
      throw new NotFoundError('case_file', fileId);
    }
  }
}
