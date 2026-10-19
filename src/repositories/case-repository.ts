import type { SqlRow } from '../db/adapter.ts';
import { ConflictError, NotFoundError, ValidationError } from '../errors.ts';
import { getSyncEntity } from '../sync/current-registry.ts';
import { todayInTimeZone, assertIsoDate } from '../util/dates.ts';
import { assertMinorAmount } from '../util/money.ts';
import {
  BaseRepository,
  type EntityRecord,
  type RepositoryDependencies,
} from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';
import type { SettingsRepository } from './settings-repository.ts';
import type { CaseFileRecord } from './case-file-repository.ts';

export interface LegalCaseRecord extends EntityRecord {
  readonly court_id: string | null;
  readonly circuit_id: string | null;
  readonly case_number: string;
  readonly case_year: number;
  readonly case_type_id: string;
  readonly litigation_degree_id: string | null;
  readonly status_id: string | null;
  readonly registration_date: string | null;
  readonly subject: string | null;
  readonly claim_amount_minor: number | null;
  readonly currency_code: string | null;
  readonly notes: string | null;
  readonly archived_at: string | null;
}

export interface CreateCaseInput {
  caseNumber: string;
  caseYear: number;
  caseTypeCode: string;
  courtId?: string;
  circuitId?: string;
  litigationDegreeCode?: string;
  statusCode?: string;
  registrationDate?: string;
  subject?: string;
  claimAmountMinor?: number;
  currencyCode?: string;
  notes?: string;
  fileIds?: readonly string[];
  fileRelationTypeCode?: string;
}

export interface CaseFull {
  readonly legalCase: LegalCaseRecord;
  readonly files: ReadonlyArray<CaseFileRecord>;
  readonly parties: ReadonlyArray<SqlRow>;
  readonly hearings: ReadonlyArray<SqlRow>;
  readonly judgments: ReadonlyArray<SqlRow>;
}

/**
 * A legal case is independent from internal files. `case_file_case` is the
 * many-to-many link, which also allows one case to serve several files.
 */
export class CaseRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly settings: SettingsRepository;
  private readonly cases: BaseRepository<LegalCaseRecord>;
  private readonly fileCases: BaseRepository<EntityRecord>;
  private readonly caseLinks: BaseRepository<EntityRecord>;

  constructor(
    deps: RepositoryDependencies,
    lookups: LookupRepository,
    settings: SettingsRepository,
  ) {
    this.deps = deps;
    this.lookups = lookups;
    this.settings = settings;
    this.cases = new BaseRepository<LegalCaseRecord>(
      deps,
      getSyncEntity('legal_case'),
    );
    this.fileCases = new BaseRepository(deps, getSyncEntity('case_file_case'));
    this.caseLinks = new BaseRepository(deps, getSyncEntity('legal_case_link'));
  }

  create(input: CreateCaseInput): LegalCaseRecord {
    if (!input.caseNumber?.trim())
      throw new ValidationError('case number is required');
    if (
      !Number.isInteger(input.caseYear) ||
      input.caseYear < 1900 ||
      input.caseYear > 2200
    ) {
      throw new ValidationError('case year must be between 1900 and 2200');
    }
    if (input.registrationDate)
      assertIsoDate(input.registrationDate, 'registrationDate');
    if (input.claimAmountMinor !== undefined) {
      assertMinorAmount(input.claimAmountMinor, 'claimAmountMinor');
      if (input.claimAmountMinor < 0)
        throw new ValidationError('claim amount cannot be negative');
    }
    this.validateCourtAndCircuit(input.courtId, input.circuitId);
    const currency = input.currencyCode ?? 'EGP';
    if (
      !this.deps.db.get('SELECT code FROM currency WHERE code = ?', [currency])
    ) {
      throw new ValidationError(`unknown currency ${currency}`);
    }

    return this.deps.db.transaction(() => {
      const legalCase = this.cases.insert({
        court_id: input.courtId ?? null,
        circuit_id: input.circuitId ?? null,
        case_number: input.caseNumber.trim(),
        case_year: input.caseYear,
        case_type_id: this.lookups.requireItemByCode(
          'case_type',
          input.caseTypeCode,
          'case type',
        ).id,
        litigation_degree_id: this.lookups.resolveOptional(
          'litigation_degree',
          input.litigationDegreeCode,
        ),
        status_id: this.lookups.requireItemByCode(
          'case_status',
          input.statusCode ?? 'registered',
          'case status',
        ).id,
        registration_date:
          input.registrationDate ??
          todayInTimeZone(this.defaultTimezone(), this.deps.clock),
        subject: input.subject ?? null,
        claim_amount_minor: input.claimAmountMinor ?? null,
        currency_code: currency,
        notes: input.notes ?? null,
        archived_at: null,
      });
      for (const fileId of input.fileIds ?? []) {
        this.linkFile(fileId, legalCase.id, {
          relationTypeCode: input.fileRelationTypeCode ?? 'related',
        });
      }
      return legalCase;
    });
  }

  linkFile(
    fileId: string,
    caseId: string,
    options: {
      relationTypeCode?: string;
      isPrimary?: boolean;
      notes?: string;
    } = {},
  ): EntityRecord {
    this.requireFile(fileId);
    this.cases.requireById(caseId);
    const existing = this.fileCases.list({
      filters: [
        { column: 'file_id', value: fileId },
        { column: 'case_id', value: caseId },
      ],
      limit: 1,
    })[0];
    if (existing) {
      throw new ConflictError(
        'case is already linked to this file',
        'ALREADY_EXISTS',
        {
          fileId,
          caseId,
        },
      );
    }
    return this.fileCases.insert({
      file_id: fileId,
      case_id: caseId,
      relation_type_id: this.lookups.resolveOptional(
        'file_relation_type',
        options.relationTypeCode ?? 'related',
      ),
      is_primary: options.isPrimary ? 1 : 0,
      notes: options.notes ?? null,
    });
  }

  linkCases(
    sourceCaseId: string,
    targetCaseId: string,
    options: { relationTypeCode?: string; notes?: string } = {},
  ): EntityRecord {
    this.cases.requireById(sourceCaseId);
    this.cases.requireById(targetCaseId);
    if (sourceCaseId === targetCaseId)
      throw new ValidationError('a case cannot link to itself');
    return this.caseLinks.insert({
      source_case_id: sourceCaseId,
      target_case_id: targetCaseId,
      relation_type_id: this.lookups.requireItemByCode(
        'case_relation_type',
        options.relationTypeCode ?? 'related',
        'case relation type',
      ).id,
      notes: options.notes ?? null,
    });
  }

  getCase(caseId: string): LegalCaseRecord {
    return this.cases.requireById(caseId);
  }

  findByNumber(fileNumber: string): LegalCaseRecord | undefined {
    return this.cases.list({
      filters: [{ column: 'case_number', value: fileNumber }],
      limit: 1,
    })[0];
  }

  getFull(caseId: string): CaseFull {
    const legalCase = this.cases.requireById(caseId);
    const files = this.deps.db.query<SqlRow>(
      `SELECT f.* FROM case_file_case cfc JOIN case_file f ON f.id = cfc.file_id
       WHERE cfc.case_id = ? AND cfc.deleted_at IS NULL AND f.deleted_at IS NULL
       ORDER BY f.file_number`,
      [caseId],
    ) as unknown as CaseFileRecord[];
    const parties = this.deps.db.query<SqlRow>(
      `SELECT cfp.*, p.display_name, r.name_ar AS role_name
       FROM case_file_party cfp JOIN party p ON p.id = cfp.party_id
       LEFT JOIN lookup_item r ON r.id = cfp.role_id
       WHERE cfp.case_id = ? AND cfp.deleted_at IS NULL
       ORDER BY cfp.ordinal`,
      [caseId],
    );
    const hearings = this.deps.db.query<SqlRow>(
      `SELECT * FROM hearing WHERE case_id = ? AND deleted_at IS NULL
       ORDER BY scheduled_at`,
      [caseId],
    );
    const judgments = this.deps.db.query<SqlRow>(
      `SELECT * FROM judgment WHERE case_id = ? AND deleted_at IS NULL
       ORDER BY issued_on DESC`,
      [caseId],
    );
    return { legalCase, files, parties, hearings, judgments };
  }

  updateStatus(caseId: string, statusCode: string): LegalCaseRecord {
    return this.cases.update(caseId, {
      status_id: this.lookups.requireItemByCode(
        'case_status',
        statusCode,
        'case status',
      ).id,
    });
  }

  updateCase(
    caseId: string,
    patch: {
      caseNumber?: string;
      caseYear?: number;
      courtId?: string | null;
      circuitId?: string | null;
      subject?: string | null;
      claimAmountMinor?: number | null;
      notes?: string | null;
    },
  ): LegalCaseRecord {
    const current = this.cases.requireById(caseId);
    const update: Record<string, string | number | null> = {};
    if (patch.caseNumber !== undefined) {
      if (!patch.caseNumber.trim())
        throw new ValidationError('case number is required');
      update.case_number = patch.caseNumber.trim();
    }
    if (patch.caseYear !== undefined) {
      if (!Number.isInteger(patch.caseYear))
        throw new ValidationError('case year must be an integer');
      update.case_year = patch.caseYear;
    }
    const nextCourt =
      patch.courtId !== undefined ? patch.courtId : current.court_id;
    const nextCircuit =
      patch.circuitId !== undefined ? patch.circuitId : current.circuit_id;
    this.validateCourtAndCircuit(
      nextCourt ?? undefined,
      nextCircuit ?? undefined,
    );
    if (patch.courtId !== undefined) update.court_id = patch.courtId;
    if (patch.circuitId !== undefined) update.circuit_id = patch.circuitId;
    if (patch.subject !== undefined) update.subject = patch.subject;
    if (patch.claimAmountMinor !== undefined) {
      if (patch.claimAmountMinor !== null)
        assertMinorAmount(patch.claimAmountMinor);
      update.claim_amount_minor = patch.claimAmountMinor;
    }
    if (patch.notes !== undefined) update.notes = patch.notes;
    return Object.keys(update).length === 0
      ? current
      : this.cases.update(caseId, update);
  }

  listCases(
    options: {
      statusCode?: string;
      courtId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): LegalCaseRecord[] {
    const filters = [];
    if (options.statusCode) {
      filters.push({
        column: 'status_id',
        value: this.lookups.requireItemByCode(
          'case_status',
          options.statusCode,
          'case status',
        ).id,
      });
    }
    if (options.courtId)
      filters.push({ column: 'court_id', value: options.courtId });
    return this.cases.list({
      filters,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      orderBy: { column: 'case_year', direction: 'desc' },
    });
  }

  archive(caseId: string): LegalCaseRecord {
    return this.cases.archive(caseId);
  }

  softDelete(
    caseId: string,
    reason?: string,
  ): { batchId: string; affectedCount: number } {
    return this.cases.softDelete(caseId, {
      ...(reason === undefined ? {} : { reason }),
    });
  }

  restore(caseId: string): { batchId: string | null; restoredCount: number } {
    return this.cases.restore(caseId);
  }

  private validateCourtAndCircuit(courtId?: string, circuitId?: string): void {
    if (circuitId) {
      if (!courtId) throw new ValidationError('a circuit requires a court');
      const circuit = this.deps.db.get<{ court_id: string }>(
        'SELECT court_id FROM court_circuit WHERE id = ? AND deleted_at IS NULL',
        [circuitId],
      );
      if (!circuit) throw new NotFoundError('court_circuit', circuitId);
      if (circuit.court_id !== courtId) {
        throw new ValidationError(
          'circuit does not belong to the selected court',
        );
      }
    }
    if (courtId) {
      const court = this.deps.db.get(
        'SELECT id FROM court WHERE id = ? AND deleted_at IS NULL',
        [courtId],
      );
      if (!court) throw new NotFoundError('court', courtId);
    }
  }

  private requireFile(fileId: string): void {
    const row = this.deps.db.get(
      'SELECT id FROM case_file WHERE id = ? AND deleted_at IS NULL',
      [fileId],
    );
    if (!row) throw new NotFoundError('case_file', fileId);
  }

  private defaultTimezone(): string {
    return this.settings.getString('locale.timezone', 'Africa/Cairo');
  }
}
