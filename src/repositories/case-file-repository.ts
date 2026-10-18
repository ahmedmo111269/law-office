import type { SqlRow } from '../db/adapter.ts';
import { ConflictError, NotFoundError, ValidationError } from '../errors.ts';
import type { NumberSeriesService } from '../services/number-series.ts';
import type { SettingsRepository } from './settings-repository.ts';
import { getSyncEntity } from '../sync/entity-registry.ts';
import { assertIsoDate, todayInTimeZone } from '../util/dates.ts';
import { newId } from '../util/uuid.ts';
import { BaseRepository, type EntityRecord, type RepositoryDependencies } from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';

export interface CaseFileRecord extends EntityRecord {
  readonly file_number: string;
  readonly title: string;
  readonly file_type_id: string;
  readonly practice_area_id: string | null;
  readonly status_id: string | null;
  readonly priority_id: string | null;
  readonly confidentiality_id: string | null;
  readonly responsible_party_id: string | null;
  readonly parent_file_id: string | null;
  readonly root_file_id: string | null;
  readonly opened_on: string;
  readonly closed_on: string | null;
  readonly description: string | null;
  readonly archived_at: string | null;
}

export interface CreateFileInput {
  title: string;
  fileNumber?: string;
  fileTypeCode?: string;
  practiceAreaCode?: string;
  statusCode?: string;
  priorityCode?: string;
  confidentialityCode?: string;
  responsiblePartyId?: string;
  parentFileId?: string;
  /** Clients linked with the default `client` role when the file is created. */
  clientPartyIds?: readonly string[];
  openedOn?: string;
  closedOn?: string;
  description?: string;
}

export interface AddFilePartyInput {
  fileId: string;
  partyId: string;
  roleCode: string;
  sideCode?: string;
  caseId?: string;
  ordinal?: number;
  isPrimary?: boolean;
  startDate?: string;
  endDate?: string;
  notes?: string;
}

export interface FilePartyView extends SqlRow {
  readonly id: string;
  readonly case_id: string | null;
  readonly party_id: string;
  readonly display_name: string;
  readonly role_id: string;
  readonly role_name: string | null;
  readonly side_name: string | null;
  readonly ordinal: number;
  readonly is_primary: number;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly notes: string | null;
}

export interface FileFull {
  readonly file: CaseFileRecord;
  readonly parties: readonly FilePartyView[];
  readonly cases: ReadonlyArray<SqlRow>;
  readonly subFiles: ReadonlyArray<CaseFileRecord>;
}

/**
 * A case file is the office's internal container. It is not necessarily one
 * lawsuit: one file can link to several cases, and one case can be linked to
 * several files through `case_file_case`.
 */
export class CaseFileRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly numbers: NumberSeriesService;
  private readonly settings: SettingsRepository;
  private readonly files: BaseRepository<CaseFileRecord>;
  private readonly fileParties: BaseRepository<EntityRecord>;
  private readonly fileCases: BaseRepository<EntityRecord>;
  private readonly fileLinks: BaseRepository<EntityRecord>;

  constructor(
    deps: RepositoryDependencies,
    lookups: LookupRepository,
    numbers: NumberSeriesService,
    settings: SettingsRepository,
  ) {
    this.deps = deps;
    this.lookups = lookups;
    this.numbers = numbers;
    this.settings = settings;
    this.files = new BaseRepository<CaseFileRecord>(deps, getSyncEntity('case_file'));
    this.fileParties = new BaseRepository(deps, getSyncEntity('case_file_party'));
    this.fileCases = new BaseRepository(deps, getSyncEntity('case_file_case'));
    this.fileLinks = new BaseRepository(deps, getSyncEntity('case_file_link'));
  }

  create(input: CreateFileInput): CaseFileRecord {
    if (!input.title?.trim()) throw new ValidationError('file title is required');
    if (input.openedOn) assertIsoDate(input.openedOn, 'openedOn');
    if (input.closedOn) assertIsoDate(input.closedOn, 'closedOn');
    if (input.responsiblePartyId) this.requireParty(input.responsiblePartyId);

    let parent: CaseFileRecord | null = null;
    if (input.parentFileId) {
      parent = this.files.requireById(input.parentFileId);
    }

    const id = newId();
    const openedOn =
      input.openedOn ??
      todayInTimeZone(this.defaultTimezone(), this.deps.clock);
    const fileNumber = input.fileNumber?.trim() || this.numbers.next('file.number').formatted;
    const rootId = parent ? parent.root_file_id ?? parent.id : id;

    return this.deps.db.transaction(() => {
      const record = this.files.insert(
      {
        file_number: fileNumber,
        title: input.title.trim(),
        file_type_id: this.lookups.requireItemByCode(
          'file_type',
          input.fileTypeCode ?? (parent ? 'sub' : 'primary'),
          'file type',
        ).id,
        practice_area_id: this.lookups.resolveOptional('practice_area', input.practiceAreaCode),
        status_id: this.lookups.requireItemByCode('file_status', input.statusCode ?? 'open', 'file status').id,
        priority_id: this.lookups.resolveOptional('priority', input.priorityCode),
        confidentiality_id: this.lookups.resolveOptional('confidentiality', input.confidentialityCode),
        responsible_party_id: input.responsiblePartyId ?? null,
        parent_file_id: parent?.id ?? null,
        root_file_id: rootId,
        opened_on: openedOn,
        closed_on: input.closedOn ?? null,
        description: input.description ?? null,
        archived_at: null,
        },
        { id },
      );
      const clientIds = [...new Set(input.clientPartyIds ?? [])];
      clientIds.forEach((partyId, index) => {
        this.addParty({
          fileId: id,
          partyId,
          roleCode: 'client',
          sideCode: 'claimant',
          isPrimary: index === 0,
        });
      });
      return record;
    });
  }

  createSubFile(parentFileId: string, input: Omit<CreateFileInput, 'parentFileId'>): CaseFileRecord {
    return this.create({ ...input, parentFileId });
  }

  linkCase(
    fileId: string,
    caseId: string,
    options: { relationTypeCode?: string; isPrimary?: boolean; notes?: string } = {},
  ): EntityRecord {
    this.files.requireById(fileId);
    this.requireCase(caseId);
    const existing = this.fileCases.list({
      filters: [
        { column: 'file_id', value: fileId },
        { column: 'case_id', value: caseId },
      ],
      limit: 1,
    })[0];
    if (existing) {
      throw new ConflictError('case is already linked to this file', 'ALREADY_EXISTS', {
        fileId,
        caseId,
      });
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

  unlinkCase(fileId: string, caseId: string): boolean {
    const link = this.fileCases.list({
      filters: [
        { column: 'file_id', value: fileId },
        { column: 'case_id', value: caseId },
      ],
      limit: 1,
    })[0];
    if (!link) return false;
    this.fileCases.softDelete(link.id);
    return true;
  }

  linkFiles(
    sourceFileId: string,
    targetFileId: string,
    options: { relationTypeCode?: string; notes?: string } = {},
  ): EntityRecord {
    this.files.requireById(sourceFileId);
    this.files.requireById(targetFileId);
    if (sourceFileId === targetFileId) throw new ValidationError('a file cannot link to itself');
    return this.fileLinks.insert({
      source_file_id: sourceFileId,
      target_file_id: targetFileId,
      relation_type_id: this.lookups.requireItemByCode(
        'file_relation_type',
        options.relationTypeCode ?? 'related',
        'file relation type',
      ).id,
      notes: options.notes ?? null,
    });
  }

  addParty(input: AddFilePartyInput): EntityRecord {
    this.files.requireById(input.fileId);
    this.requireParty(input.partyId);
    if (input.caseId) {
      const linked = this.deps.db.get(
        `SELECT 1 AS ok FROM case_file_case
         WHERE file_id = ? AND case_id = ? AND deleted_at IS NULL`,
        [input.fileId, input.caseId],
      );
      if (!linked) {
        throw new ValidationError('case is not linked to this file', {
          fileId: input.fileId,
          caseId: input.caseId,
        });
      }
    }
    if (input.startDate) assertIsoDate(input.startDate, 'startDate');
    if (input.endDate) assertIsoDate(input.endDate, 'endDate');

    const role = this.lookups.requireItemByCode('party_role', input.roleCode, 'party role');
    const duplicate = this.deps.db.get(
      `SELECT 1 AS ok FROM case_file_party
       WHERE file_id = ? AND party_id = ? AND role_id = ?
         AND (case_id IS ? OR case_id = ?) AND deleted_at IS NULL`,
      [input.fileId, input.partyId, role.id, input.caseId ?? null, input.caseId ?? null],
    );
    if (duplicate) {
      throw new ConflictError('party already has this role in the file', 'ALREADY_EXISTS', {
        fileId: input.fileId,
        partyId: input.partyId,
        role: input.roleCode,
      });
    }

    const nextOrdinal =
      input.ordinal ??
      ((this.deps.db.get<{ m: number }>(
        'SELECT COALESCE(MAX(ordinal), 0) AS m FROM case_file_party WHERE file_id = ? AND deleted_at IS NULL',
        [input.fileId],
      )?.m ?? 0) + 10);

    return this.fileParties.insert({
      file_id: input.fileId,
      case_id: input.caseId ?? null,
      party_id: input.partyId,
      role_id: role.id,
      side_id: this.lookups.resolveOptional('party_side', input.sideCode),
      ordinal: nextOrdinal,
      is_primary: input.isPrimary ? 1 : 0,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
      notes: input.notes ?? null,
    });
  }

  removeParty(linkId: string, reason?: string): { batchId: string; affectedCount: number } {
    return this.fileParties.softDelete(linkId, { ...(reason === undefined ? {} : { reason }) });
  }

  getFile(fileId: string): CaseFileRecord {
    return this.files.requireById(fileId);
  }

  findByNumber(fileNumber: string): CaseFileRecord | undefined {
    return this.files.list({ filters: [{ column: 'file_number', value: fileNumber }], limit: 1 })[0];
  }

  getFull(fileId: string): FileFull {
    const file = this.files.requireById(fileId);
    const parties = this.deps.db.query<FilePartyView>(
      `SELECT cfp.id, cfp.case_id, cfp.party_id, p.display_name,
              cfp.role_id, r.name_ar AS role_name, s.name_ar AS side_name,
              cfp.ordinal, cfp.is_primary, cfp.start_date, cfp.end_date, cfp.notes
       FROM case_file_party cfp
       JOIN party p ON p.id = cfp.party_id
       LEFT JOIN lookup_item r ON r.id = cfp.role_id
       LEFT JOIN lookup_item s ON s.id = cfp.side_id
       WHERE cfp.file_id = ? AND cfp.deleted_at IS NULL
       ORDER BY cfp.ordinal, p.display_name`,
      [fileId],
    );
    const cases = this.deps.db.query<SqlRow>(
      `SELECT c.id, c.case_number, c.case_year, c.status_id, ct.name AS court_name,
              cfc.relation_type_id, cfc.is_primary
       FROM case_file_case cfc
       JOIN legal_case c ON c.id = cfc.case_id
       LEFT JOIN court ct ON ct.id = c.court_id
       WHERE cfc.file_id = ? AND cfc.deleted_at IS NULL AND c.deleted_at IS NULL
       ORDER BY c.case_year DESC, c.case_number`,
      [fileId],
    );
    const subFiles = this.files.list({
      filters: [{ column: 'parent_file_id', value: fileId }],
      limit: 200,
      orderBy: { column: 'file_number', direction: 'asc' },
    });
    return { file, parties, cases, subFiles };
  }

  listFiles(
    options: {
      statusCode?: string;
      practiceAreaCode?: string;
      fileTypeCode?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): CaseFileRecord[] {
    const filters = [];
    if (options.statusCode) {
      filters.push({
        column: 'status_id',
        value: this.lookups.requireItemByCode('file_status', options.statusCode, 'file status').id,
      });
    }
    if (options.practiceAreaCode) {
      filters.push({
        column: 'practice_area_id',
        value: this.lookups.requireItemByCode(
          'practice_area',
          options.practiceAreaCode,
          'practice area',
        ).id,
      });
    }
    if (options.fileTypeCode) {
      filters.push({
        column: 'file_type_id',
        value: this.lookups.requireItemByCode('file_type', options.fileTypeCode, 'file type').id,
      });
    }
    return this.files.list({
      filters,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      orderBy: { column: 'opened_on', direction: 'desc' },
    });
  }

  updateFile(
    fileId: string,
    patch: {
      title?: string;
      statusCode?: string;
      practiceAreaCode?: string;
      priorityCode?: string;
      confidentialityCode?: string;
      responsiblePartyId?: string | null;
      closedOn?: string | null;
      description?: string | null;
    },
  ): CaseFileRecord {
    const update: Record<string, string | null> = {};
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new ValidationError('file title is required');
      update.title = patch.title.trim();
    }
    if (patch.statusCode !== undefined) {
      update.status_id = this.lookups.requireItemByCode('file_status', patch.statusCode).id;
    }
    if (patch.practiceAreaCode !== undefined) {
      update.practice_area_id = this.lookups.resolveOptional('practice_area', patch.practiceAreaCode);
    }
    if (patch.priorityCode !== undefined) {
      update.priority_id = this.lookups.resolveOptional('priority', patch.priorityCode);
    }
    if (patch.confidentialityCode !== undefined) {
      update.confidentiality_id = this.lookups.resolveOptional(
        'confidentiality',
        patch.confidentialityCode,
      );
    }
    if (patch.responsiblePartyId !== undefined) {
      if (patch.responsiblePartyId) this.requireParty(patch.responsiblePartyId);
      update.responsible_party_id = patch.responsiblePartyId;
    }
    if (patch.closedOn !== undefined) {
      if (patch.closedOn) assertIsoDate(patch.closedOn, 'closedOn');
      update.closed_on = patch.closedOn;
    }
    if (patch.description !== undefined) update.description = patch.description;
    return Object.keys(update).length === 0
      ? this.files.requireById(fileId)
      : this.files.update(fileId, update);
  }

  archive(fileId: string): CaseFileRecord {
    return this.files.archive(fileId);
  }

  unarchive(fileId: string): CaseFileRecord {
    return this.files.unarchive(fileId);
  }

  softDelete(fileId: string, reason?: string): { batchId: string; affectedCount: number } {
    return this.files.softDelete(fileId, { ...(reason === undefined ? {} : { reason }) });
  }

  restore(fileId: string): { batchId: string | null; restoredCount: number } {
    return this.files.restore(fileId);
  }

  private requireParty(partyId: string): void {
    const party = this.deps.db.get('SELECT id FROM party WHERE id = ? AND deleted_at IS NULL', [
      partyId,
    ]);
    if (!party) throw new NotFoundError('party', partyId);
  }

  private requireCase(caseId: string): void {
    const row = this.deps.db.get('SELECT id FROM legal_case WHERE id = ? AND deleted_at IS NULL', [
      caseId,
    ]);
    if (!row) throw new NotFoundError('legal_case', caseId);
  }

  private defaultTimezone(): string {
    return this.settings.getString('locale.timezone', 'Africa/Cairo');
  }
}
