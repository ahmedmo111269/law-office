import type { SqlRow } from '../db/adapter.ts';
import { NotFoundError, ValidationError } from '../errors.ts';
import type { NumberSeriesService } from '../services/number-series.ts';
import { getSyncEntity } from '../sync/entity-registry.ts';
import { assertIsoDate } from '../util/dates.ts';
import { assertMinorAmount } from '../util/money.ts';
import { BaseRepository, type EntityRecord, type RepositoryDependencies } from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';

export interface ContractRecord extends EntityRecord {
  readonly contract_number: string | null;
  readonly title: string;
  readonly contract_type_id: string | null;
  readonly status_id: string | null;
  readonly signed_on: string | null;
  readonly start_on: string | null;
  readonly end_on: string | null;
  readonly value_minor: number | null;
  readonly currency_code: string | null;
  readonly file_id: string | null;
  readonly terms_summary: string | null;
  readonly archived_at: string | null;
}

export interface PoaRecord extends EntityRecord {
  readonly instrument_kind_id: string | null;
  readonly poa_number: string | null;
  readonly issued_on: string | null;
  readonly expires_on: string | null;
  readonly notary_office: string | null;
  readonly principal_party_id: string;
  readonly agent_party_id: string;
  readonly scope_text: string | null;
  readonly status_id: string | null;
  readonly file_id: string | null;
  readonly archived_at: string | null;
}

export class ContractRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly numbers: NumberSeriesService;
  private readonly contracts: BaseRepository<ContractRecord>;
  private readonly contractParties: BaseRepository<EntityRecord>;
  private readonly poas: BaseRepository<PoaRecord>;

  constructor(deps: RepositoryDependencies, lookups: LookupRepository, numbers: NumberSeriesService) {
    this.deps = deps;
    this.lookups = lookups;
    this.numbers = numbers;
    this.contracts = new BaseRepository<ContractRecord>(deps, getSyncEntity('contract'));
    this.contractParties = new BaseRepository(deps, getSyncEntity('contract_party'));
    this.poas = new BaseRepository<PoaRecord>(deps, getSyncEntity('power_of_attorney'));
  }

  createContract(input: {
    title: string;
    contractNumber?: string;
    generateNumber?: boolean;
    contractTypeCode?: string;
    statusCode?: string;
    signedOn?: string;
    startOn?: string;
    endOn?: string;
    valueMinor?: number;
    currencyCode?: string;
    fileId?: string;
    termsSummary?: string;
    notes?: string;
    parties?: ReadonlyArray<{ partyId: string; roleCode: string; isPrimary?: boolean }>;
  }): ContractRecord {
    if (!input.title?.trim()) throw new ValidationError('contract title is required');
    if (input.fileId) this.requireExisting('case_file', input.fileId);
    for (const dateField of ['signedOn', 'startOn', 'endOn'] as const) {
      const value = input[dateField];
      if (value) assertIsoDate(value, dateField);
    }
    if (input.endOn && input.startOn && input.endOn < input.startOn) {
      throw new ValidationError('end date cannot precede start date');
    }
    if (input.valueMinor !== undefined) assertMinorAmount(input.valueMinor, 'valueMinor');
    const currency = input.currencyCode ?? 'EGP';
    this.requireCurrency(currency);
    const contractNumber =
      input.contractNumber?.trim() ||
      ((input.generateNumber ?? true) ? this.numbers.next('contract.number').formatted : null);

    return this.deps.db.transaction(() => {
      const contract = this.contracts.insert({
        contract_number: contractNumber,
        title: input.title.trim(),
        contract_type_id: this.lookups.resolveOptional('contract_type', input.contractTypeCode),
        status_id: this.lookups.requireItemByCode(
          'contract_status',
          input.statusCode ?? 'draft',
          'contract status',
        ).id,
        signed_on: input.signedOn ?? null,
        start_on: input.startOn ?? null,
        end_on: input.endOn ?? null,
        value_minor: input.valueMinor ?? null,
        currency_code: currency,
        file_id: input.fileId ?? null,
        terms_summary: input.termsSummary ?? null,
        notes: input.notes ?? null,
        archived_at: null,
      });
      for (const party of input.parties ?? []) {
        this.addParty(contract.id, party);
      }
      return contract;
    });
  }

  addParty(
    contractId: string,
    input: { partyId: string; roleCode: string; isPrimary?: boolean },
  ): EntityRecord {
    this.contracts.requireById(contractId);
    this.requireExisting('party', input.partyId);
    const role = this.lookups.requireItemByCode(
      'contract_party_role',
      input.roleCode,
      'contract party role',
    );
    const existing = this.contractParties.list({
      filters: [
        { column: 'contract_id', value: contractId },
        { column: 'party_id', value: input.partyId },
        { column: 'role_id', value: role.id },
      ],
      limit: 1,
    })[0];
    if (existing) {
      throw new ValidationError('party already has this role on the contract');
    }
    return this.contractParties.insert({
      contract_id: contractId,
      party_id: input.partyId,
      role_id: role.id,
      is_primary: input.isPrimary ? 1 : 0,
      notes: null,
    });
  }

  createPoa(input: {
    principalPartyId: string;
    agentPartyId: string;
    poaNumber?: string;
    generateNumber?: boolean;
    instrumentKindCode?: string;
    issuedOn?: string;
    expiresOn?: string;
    notaryOffice?: string;
    scopeText?: string;
    statusCode?: string;
    fileId?: string;
    notes?: string;
  }): PoaRecord {
    if (input.principalPartyId === input.agentPartyId) {
      throw new ValidationError('principal and agent must be different parties');
    }
    this.requireExisting('party', input.principalPartyId);
    this.requireExisting('party', input.agentPartyId);
    if (input.fileId) this.requireExisting('case_file', input.fileId);
    if (input.issuedOn) assertIsoDate(input.issuedOn, 'issuedOn');
    if (input.expiresOn) assertIsoDate(input.expiresOn, 'expiresOn');
    if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) {
      throw new ValidationError('expiry cannot precede issue date');
    }
    const poaNumber =
      input.poaNumber?.trim() ||
      ((input.generateNumber ?? true) ? this.numbers.next('poa.number').formatted : null);

    return this.poas.insert({
      instrument_kind_id: this.lookups.requireItemByCode(
        'instrument_kind',
        input.instrumentKindCode ?? 'power_of_attorney',
        'instrument kind',
      ).id,
      poa_number: poaNumber,
      issued_on: input.issuedOn ?? null,
      expires_on: input.expiresOn ?? null,
      notary_office: input.notaryOffice ?? null,
      principal_party_id: input.principalPartyId,
      agent_party_id: input.agentPartyId,
      scope_text: input.scopeText ?? null,
      status_id: this.lookups.requireItemByCode('poa_status', input.statusCode ?? 'active').id,
      file_id: input.fileId ?? null,
      notes: input.notes ?? null,
      archived_at: null,
    });
  }

  getContract(id: string): ContractRecord {
    return this.contracts.requireById(id);
  }

  getContractFull(id: string): { contract: ContractRecord; parties: ReadonlyArray<SqlRow> } {
    const contract = this.contracts.requireById(id);
    const parties = this.deps.db.query<SqlRow>(
      `SELECT cp.*, p.display_name, r.name_ar AS role_name
       FROM contract_party cp JOIN party p ON p.id = cp.party_id
       LEFT JOIN lookup_item r ON r.id = cp.role_id
       WHERE cp.contract_id = ? AND cp.deleted_at IS NULL`,
      [id],
    );
    return { contract, parties };
  }

  getPoa(id: string): PoaRecord {
    return this.poas.requireById(id);
  }

  getPoaFull(id: string): {
    poa: PoaRecord;
    principal: SqlRow | undefined;
    agent: SqlRow | undefined;
  } {
    const poa = this.poas.requireById(id);
    return {
      poa,
      principal: this.deps.db.get<SqlRow>('SELECT id, display_name FROM party WHERE id = ?', [
        poa.principal_party_id,
      ]),
      agent: this.deps.db.get<SqlRow>('SELECT id, display_name FROM party WHERE id = ?', [
        poa.agent_party_id,
      ]),
    };
  }

  listContracts(options: { limit?: number; offset?: number } = {}): ContractRecord[] {
    return this.contracts.list({
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      orderBy: { column: 'created_at', direction: 'desc' },
    });
  }

  /** Uses only user-entered expiry dates; no legal assumptions. */
  listPoaExpiring(fromDate: string, toDate: string, limit = 100): PoaRecord[] {
    assertIsoDate(fromDate, 'fromDate');
    assertIsoDate(toDate, 'toDate');
    return this.deps.db
      .query<SqlRow>(
        `SELECT * FROM power_of_attorney
         WHERE expires_on IS NOT NULL AND expires_on >= ? AND expires_on <= ?
           AND deleted_at IS NULL
         ORDER BY expires_on LIMIT ?`,
        [fromDate, toDate, limit],
      )
      .map((row) => ({ ...row, id: String(row.id) })) as unknown as PoaRecord[];
  }

  archiveContract(id: string): ContractRecord {
    return this.contracts.archive(id);
  }

  archivePoa(id: string): PoaRecord {
    return this.poas.archive(id);
  }

  softDeleteContract(id: string, reason?: string): { batchId: string; affectedCount: number } {
    return this.contracts.softDelete(id, { ...(reason === undefined ? {} : { reason }) });
  }

  restoreContract(id: string): { batchId: string | null; restoredCount: number } {
    return this.contracts.restore(id);
  }

  softDeletePoa(id: string, reason?: string): { batchId: string; affectedCount: number } {
    return this.poas.softDelete(id, { ...(reason === undefined ? {} : { reason }) });
  }

  restorePoa(id: string): { batchId: string | null; restoredCount: number } {
    return this.poas.restore(id);
  }

  private requireExisting(table: string, id: string): SqlRow {
    const row = this.deps.db.get<SqlRow>(
      `SELECT * FROM "${table}" WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    if (!row) throw new NotFoundError(table, id);
    return row;
  }

  private requireCurrency(code: string): void {
    if (!this.deps.db.get('SELECT code FROM currency WHERE code = ? AND is_active = 1', [code])) {
      throw new ValidationError(`unknown currency ${code}`);
    }
  }
}
