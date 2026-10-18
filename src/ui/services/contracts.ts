import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';

export interface ContractRow {
  contract: EngineRow;
  typeName: string;
  statusName: string;
  fileLabel: string | null;
  partyNames: string[];
}

export interface PoaRow {
  poa: EngineRow;
  kindName: string;
  statusName: string;
  principalName: string | null;
  agentName: string | null;
  fileLabel: string | null;
}

export class ContractService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async listContracts(request: TableRequest): Promise<TableResult<ContractRow>> {
    const { db, lookups, cache } = this.deps;
    const statusId = request.filters.status ? lookups.id('contract_status', request.filters.status) : null;
    let contracts: EngineRow[];
    let total: number;
    if (request.search.trim()) {
      const hits: string[] = [];
      let offset = 0;
      for (;;) {
        const page = await db.searchPage(request.search.trim(), { entityType: 'contract', limit: 200, offset });
        hits.push(...page.hits.map((hit) => hit.entityId));
        offset += page.hits.length;
        if (page.hits.length === 0 || offset >= page.total) break;
      }
      contracts = [];
      for (const id of hits) {
        const contract = await db.get('contract', id);
        if (!contract) continue;
        if (statusId && String(contract.status_id) !== statusId) continue;
        contracts.push(contract);
      }
      total = contracts.length;
      contracts.sort((a, b) => String(a.title).localeCompare(String(b.title), 'ar'));
      const { offset: pageOffset, limit } = paginate(request.page, request.pageSize);
      contracts = contracts.slice(pageOffset, pageOffset + limit);
    } else {
      const page = await db.query('contract', {
        filters: statusId ? [{ column: 'status_id', op: 'eq', value: statusId }] : [],
        orderBy: [{ column: request.sortKey === 'title' ? 'title' : 'signed_on', direction: request.sortDir ?? 'desc' }],
        ...paginate(request.page, request.pageSize),
      });
      contracts = page.rows;
      total = page.total;
    }
    const rows: ContractRow[] = [];
    for (const contract of contracts) {
      const partyLinks = await db.query('contract_party', {
        filters: [{ column: 'contract_id', op: 'eq', value: String(contract.id) }],
        limit: 20,
      });
      const parties = await cache.many('party', partyLinks.rows.map((link) => String(link.party_id)));
      const file = await cache.get('case_file', contract.file_id ? String(contract.file_id) : null);
      rows.push({
        contract,
        typeName: lookups.byId(String(contract.contract_type_id ?? ''))?.nameAr ?? '—',
        statusName: lookups.byId(String(contract.status_id ?? ''))?.nameAr ?? '—',
        fileLabel: file ? String(file.file_number) : null,
        partyNames: [...parties.values()].map((party) => String(party.display_name)),
      });
    }
    return { rows, total };
  }

  async getContract(id: string): Promise<{ contract: EngineRow; parties: Array<{ link: EngineRow; party: EngineRow }>; documents: EngineRow[]; activity: EngineRow[] } | null> {
    const { db } = this.deps;
    const contract = await db.get('contract', id);
    if (!contract) return null;
    const links = (await db.query('contract_party', {
      filters: [{ column: 'contract_id', op: 'eq', value: id }],
      limit: 50,
    })).rows;
    const parties: Array<{ link: EngineRow; party: EngineRow }> = [];
    for (const link of links) {
      const party = await db.get('party', String(link.party_id));
      if (party) parties.push({ link, party });
    }
    const documents = await this.linkedDocuments('contract_id', id);
    const activity = await db.auditTrail('contract', id, 30);
    return { contract, parties, documents, activity };
  }

  async createContract(input: {
    title: string;
    contractTypeCode?: string;
    statusCode?: string;
    signedOn?: string;
    startOn?: string;
    endOn?: string;
    valueMinor?: number;
    currencyCode?: string;
    fileId?: string;
    termsSummary?: string;
    partyIds?: readonly { partyId: string; roleCode: string; isPrimary?: boolean }[];
  }): Promise<EngineRow> {
    if (!input.title.trim()) throw new ValidationError('contract title is required');
    const { db, lookups, cache } = this.deps;
    const number = (await db.nextNumber('contract.number')).formatted;
    const contract = await db.insert('contract', {
      contract_number: number,
      title: input.title.trim(),
      contract_type_id: lookups.id('contract_type', input.contractTypeCode ?? 'fixed_fee'),
      status_id: lookups.id('contract_status', input.statusCode ?? 'active'),
      signed_on: input.signedOn ?? null,
      start_on: input.startOn ?? null,
      end_on: input.endOn ?? null,
      value_minor: input.valueMinor ?? null,
      currency_code: input.currencyCode ?? 'EGP',
      file_id: input.fileId ?? null,
      terms_summary: input.termsSummary?.trim() || null,
      notes: null,
      archived_at: null,
    });
    for (const party of input.partyIds ?? []) {
      await db.insert('contract_party', {
        contract_id: String(contract.id),
        party_id: party.partyId,
        role_id: lookups.id('contract_party_role', party.roleCode),
        is_primary: party.isPrimary ? 1 : 0,
        notes: null,
      });
    }
    cache.invalidate();
    return contract;
  }

  async updateContract(id: string, patch: Record<string, unknown>): Promise<void> {
    await this.deps.db.update('contract', id, patch);
    this.deps.cache.invalidate('contract', id);
  }

  async listPoas(request: TableRequest): Promise<TableResult<PoaRow>> {
    const { db, lookups, cache } = this.deps;
    const statusId = request.filters.status ? lookups.id('poa_status', request.filters.status) : null;
    const page = await db.query('power_of_attorney', {
      filters: statusId ? [{ column: 'status_id', op: 'eq', value: statusId }] : [],
      orderBy: [{ column: request.sortKey === 'poa_number' ? 'poa_number' : 'issued_on', direction: request.sortDir ?? 'desc' }],
      ...paginate(request.page, request.pageSize),
    });
    const rows: PoaRow[] = [];
    for (const poa of page.rows) {
      const principal = await cache.get('party', String(poa.principal_party_id));
      const agent = await cache.get('party', String(poa.agent_party_id));
      const file = await cache.get('case_file', poa.file_id ? String(poa.file_id) : null);
      rows.push({
        poa,
        kindName: lookups.byId(String(poa.instrument_kind_id ?? ''))?.nameAr ?? '—',
        statusName: lookups.byId(String(poa.status_id ?? ''))?.nameAr ?? '—',
        principalName: principal ? String(principal.display_name) : null,
        agentName: agent ? String(agent.display_name) : null,
        fileLabel: file ? String(file.file_number) : null,
      });
    }
    return { rows, total: page.total };
  }

  async getPoa(id: string): Promise<{ poa: EngineRow; principal: EngineRow | null; agent: EngineRow | null; documents: EngineRow[]; activity: EngineRow[] } | null> {
    const { db, cache } = this.deps;
    const poa = await db.get('power_of_attorney', id);
    if (!poa) return null;
    return {
      poa,
      principal: await cache.get('party', String(poa.principal_party_id)),
      agent: await cache.get('party', String(poa.agent_party_id)),
      documents: await this.linkedDocuments('power_of_attorney_id', id),
      activity: await db.auditTrail('power_of_attorney', id, 30),
    };
  }

  async createPoa(input: {
    principalPartyId: string;
    agentPartyId: string;
    kindCode?: string;
    poaNumber?: string;
    issuedOn?: string;
    expiresOn?: string;
    notaryOffice?: string;
    scopeText?: string;
    statusCode?: string;
    fileId?: string;
  }): Promise<EngineRow> {
    if (!input.principalPartyId || !input.agentPartyId) throw new ValidationError('principal and agent are required');
    const number = input.poaNumber?.trim() || (await this.deps.db.nextNumber('poa.number')).formatted;
    const poa = await this.deps.db.insert('power_of_attorney', {
      instrument_kind_id: this.deps.lookups.id('instrument_kind', input.kindCode ?? 'power_of_attorney'),
      poa_number: number,
      issued_on: input.issuedOn ?? null,
      expires_on: input.expiresOn ?? null,
      notary_office: input.notaryOffice?.trim() || null,
      principal_party_id: input.principalPartyId,
      agent_party_id: input.agentPartyId,
      scope_text: input.scopeText?.trim() || null,
      status_id: this.deps.lookups.id('poa_status', input.statusCode ?? 'active'),
      file_id: input.fileId ?? null,
      notes: null,
      archived_at: null,
    });
    this.deps.cache.invalidate();
    return poa;
  }

  async updatePoa(id: string, patch: Record<string, unknown>): Promise<void> {
    await this.deps.db.update('power_of_attorney', id, patch);
    this.deps.cache.invalidate('power_of_attorney', id);
  }

  private async linkedDocuments(column: 'contract_id' | 'power_of_attorney_id', id: string): Promise<EngineRow[]> {
    const links = await this.deps.db.query('document_link', {
      filters: [{ column, op: 'eq', value: id }],
      limit: 50,
    });
    const documents: EngineRow[] = [];
    for (const link of links.rows) {
      const doc = await this.deps.db.get('document', String(link.document_id));
      if (doc) documents.push(doc);
    }
    return documents;
  }
}
