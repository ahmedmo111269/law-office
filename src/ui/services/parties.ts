import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';

export interface PartyRow {
  party: EngineRow;
  person: EngineRow | null;
  organization: EngineRow | null;
  client: EngineRow | null;
  phone: string | null;
  filesCount: number;
  statusName: string;
}

export interface PartyDetail {
  party: EngineRow;
  person: EngineRow | null;
  organization: EngineRow | null;
  client: EngineRow | null;
  contacts: EngineRow[];
  addresses: EngineRow[];
  files: Array<{ link: EngineRow; file: EngineRow; roleName: string; sideName: string }>;
  cases: EngineRow[];
  interactions: EngineRow[];
  aliases: EngineRow[];
  relationships: Array<{ relationship: EngineRow; other: EngineRow | null; direction: 'from' | 'to' }>;
  charges: EngineRow[];
  outstandingMinor: number;
  activity: EngineRow[];
}

export class PartyService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async list(request: TableRequest): Promise<TableResult<PartyRow>> {
    const { db, lookups } = this.deps;
    const statusId = request.filters.status ? lookups.id('party_status', request.filters.status) : null;
    const kind = request.filters.kind ?? '';
    const clientFilter = request.filters.client ?? '';

    let parties: EngineRow[];
    let total: number;
    if (request.search.trim()) {
      const ids: string[] = [];
      let offset = 0;
      for (;;) {
        const page = await db.searchPage(request.search.trim(), { entityType: 'party', limit: 200, offset });
        ids.push(...page.hits.map((hit) => hit.entityId));
        offset += page.hits.length;
        if (page.hits.length === 0 || offset >= page.total) break;
      }
      parties = [];
      for (const id of ids) {
        const party = await db.get('party', id);
        if (!party) continue;
        if (statusId && String(party.status_id ?? '') !== statusId) continue;
        if (kind && String(party.kind) !== kind) continue;
        parties.push(party);
      }
      parties.sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), 'ar'));
      total = parties.length;
      const { offset: pageOffset, limit } = paginate(request.page, request.pageSize);
      parties = parties.slice(pageOffset, pageOffset + limit);
    } else {
      const page = await db.query('party', {
        filters: [
          ...(statusId ? [{ column: 'status_id', op: 'eq' as const, value: statusId }] : []),
          ...(kind ? [{ column: 'kind', op: 'eq' as const, value: kind }] : []),
        ],
        orderBy: [{ column: 'display_name', direction: 'asc' }],
        ...paginate(request.page, request.pageSize),
      });
      parties = page.rows;
      total = page.total;
    }

    const rows: PartyRow[] = [];
    for (const party of parties) {
      const person = party.kind === 'person' ? (await db.get('person', String(party.id))) ?? null : null;
      const organization = party.kind === 'organization' ? (await db.get('organization', String(party.id))) ?? null : null;
      const client = await db.get('client_profile', String(party.id));
      if (clientFilter === 'clients' && !client) continue;
      if (clientFilter === 'non_clients' && client) continue;
      const contacts = await db.query('party_contact', {
        filters: [{ column: 'party_id', op: 'eq', value: String(party.id) }],
        limit: 5,
      });
      const fileLinks = await db.query('case_file_party', {
        filters: [{ column: 'party_id', op: 'eq', value: String(party.id) }],
        limit: 0,
      });
      rows.push({
        party,
        person,
        organization,
        client: client ?? null,
        phone: contacts.rows[0]?.value ? String(contacts.rows[0].value) : null,
        filesCount: fileLinks.total,
        statusName: lookups.byId(String(party.status_id ?? ''))?.nameAr ?? '—',
      });
    }
    return { rows, total: clientFilter ? rows.length : total };
  }

  async get(partyId: string): Promise<PartyDetail | null> {
    const { db, lookups, cache } = this.deps;
    const party = await db.get('party', String(partyId));
    if (!party) return null;
    const person = party.kind === 'person' ? (await db.get('person', partyId)) ?? null : null;
    const organization = party.kind === 'organization' ? (await db.get('organization', partyId)) ?? null : null;
    const client = (await db.get('client_profile', partyId)) ?? null;
    const contacts = (await db.query('party_contact', {
      filters: [{ column: 'party_id', op: 'eq', value: partyId }],
      limit: 50,
    })).rows;
    const addresses = (await db.query('party_address', {
      filters: [{ column: 'party_id', op: 'eq', value: partyId }],
      limit: 50,
    })).rows;
    const fileLinks = (await db.query('case_file_party', {
      filters: [{ column: 'party_id', op: 'eq', value: partyId }],
      limit: 100,
    })).rows;
    const files: PartyDetail['files'] = [];
    const caseIds = new Set<string>();
    for (const link of fileLinks) {
      const file = await cache.get('case_file', String(link.file_id));
      if (!file) continue;
      files.push({
        link,
        file,
        roleName: lookups.byId(String(link.role_id ?? ''))?.nameAr ?? '—',
        sideName: lookups.byId(String(link.side_id ?? ''))?.nameAr ?? '—',
      });
      const caseLinks = await db.query('case_file_case', {
        filters: [{ column: 'file_id', op: 'eq', value: String(file.id) }],
        limit: 50,
      });
      for (const caseLink of caseLinks.rows) caseIds.add(String(caseLink.case_id));
    }
    const cases: EngineRow[] = [];
    for (const caseId of caseIds) {
      const legalCase = await cache.get('legal_case', caseId);
      if (legalCase) cases.push(legalCase);
    }
    const interactions = (await db.query('party_interaction', {
      filters: [{ column: 'party_id', op: 'eq', value: partyId }],
      orderBy: [{ column: 'occurred_at', direction: 'desc' }],
      limit: 50,
    })).rows;
    const aliases = (await db.query('party_alias', {
      filters: [{ column: 'party_id', op: 'eq', value: partyId }],
      limit: 30,
    })).rows;
    const outgoing = (await db.query('party_relationship', {
      filters: [{ column: 'from_party_id', op: 'eq', value: partyId }],
      limit: 30,
    })).rows;
    const incoming = (await db.query('party_relationship', {
      filters: [{ column: 'to_party_id', op: 'eq', value: partyId }],
      limit: 30,
    })).rows;
    const relationships: PartyDetail['relationships'] = [];
    for (const relationship of outgoing) {
      relationships.push({ relationship, other: await cache.get('party', String(relationship.to_party_id)), direction: 'from' });
    }
    for (const relationship of incoming) {
      relationships.push({ relationship, other: await cache.get('party', String(relationship.from_party_id)), direction: 'to' });
    }
    const charges = (await db.query('financial_charge', {
      filters: [{ column: 'client_party_id', op: 'eq', value: partyId }],
      orderBy: [{ column: 'issued_on', direction: 'desc' }],
      limit: 50,
    })).rows;
    let outstandingMinor = 0;
    for (const charge of charges) {
      const balance = await db.chargeBalance(String(charge.id));
      outstandingMinor += Math.max(0, balance.outstandingMinor);
    }
    const activity = await db.auditTrail('party', partyId, 40);
    return {
      party,
      person,
      organization,
      client,
      contacts,
      addresses,
      files,
      cases,
      interactions,
      aliases,
      relationships,
      charges,
      outstandingMinor,
      activity,
    };
  }

  async create(input: {
    kind: 'person' | 'organization';
    displayName?: string;
    firstName?: string;
    middleName?: string;
    lastName?: string;
    legalName?: string;
    tradeName?: string;
    legalFormCode?: string;
    nationalId?: string;
    taxId?: string;
    commercialRegistryNo?: string;
    phone?: string;
    email?: string;
    statusCode?: string;
    notes?: string;
    client?: boolean;
  }): Promise<EngineRow> {
    const { db } = this.deps;
    let created: { party: EngineRow } | null = null;
    if (input.kind === 'person') {
      const result = (await db.createPerson(
        {
          firstName: input.firstName?.trim() ?? '',
          ...(input.middleName?.trim() ? { middleName: input.middleName.trim() } : {}),
          lastName: input.lastName?.trim() ?? '',
          ...(input.nationalId?.trim() ? { nationalId: input.nationalId.trim() } : {}),
          ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        },
        { client: input.client === true },
      )) as unknown as { party: EngineRow };
      created = result;
    } else {
      const result = (await db.createOrganization(
        {
          legalName: input.legalName?.trim() ?? '',
          ...(input.tradeName?.trim() ? { tradeName: input.tradeName.trim() } : {}),
          ...(input.legalFormCode ? { legalFormCode: input.legalFormCode } : {}),
          ...(input.commercialRegistryNo?.trim() ? { commercialRegistryNo: input.commercialRegistryNo.trim() } : {}),
          ...(input.taxId?.trim() ? { taxId: input.taxId.trim() } : {}),
          ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        },
        { client: input.client === true },
      )) as unknown as { party: EngineRow };
      created = result;
    }
    if (!created) throw new ValidationError('party was not created');
    if (input.statusCode) {
      await db.update('party', String(created.party.id), {
        status_id: this.deps.lookups.id('party_status', input.statusCode),
      });
    }
    if (input.phone?.trim()) {
      await db.insert('party_contact', {
        party_id: String(created.party.id),
        type_id: this.deps.lookups.id('contact_type', 'mobile'),
        value: input.phone.trim(),
        is_primary: 1,
        notes: null,
      });
    }
    if (input.email?.trim()) {
      await db.insert('party_contact', {
        party_id: String(created.party.id),
        type_id: this.deps.lookups.id('contact_type', 'email'),
        value: input.email.trim(),
        is_primary: 0,
        notes: null,
      });
    }
    this.deps.cache.invalidate();
    return (await db.get('party', String(created.party.id))) ?? created.party;
  }

  async addInteraction(input: {
    partyId: string;
    summary: string;
    details?: string;
    channelCode?: string;
    direction?: 'inbound' | 'outbound';
    occurredAt?: string;
    followUpAt?: string;
    fileId?: string;
  }): Promise<EngineRow> {
    if (!input.summary.trim()) throw new ValidationError('interaction summary is required');
    const interaction = await this.deps.db.insert('party_interaction', {
      party_id: input.partyId,
      channel_id: this.deps.lookups.id('interaction_channel', input.channelCode ?? 'phone'),
      direction: input.direction ?? 'outbound',
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      summary: input.summary.trim(),
      details: input.details?.trim() || null,
      follow_up_at: input.followUpAt ?? null,
      file_id: input.fileId ?? null,
    });
    return interaction;
  }

  async addAlias(partyId: string, alias: string, notes?: string): Promise<EngineRow> {
    if (!alias.trim()) throw new ValidationError('alias is required');
    return this.deps.db.insert('party_alias', {
      party_id: partyId,
      alias: alias.trim(),
      kind: 'variant',
      notes: notes?.trim() || null,
    });
  }

  async addRelationship(input: {
    fromPartyId: string;
    toPartyId: string;
    relationTypeCode: string;
    description?: string;
  }): Promise<EngineRow> {
    if (input.fromPartyId === input.toPartyId) throw new ValidationError('a party cannot relate to itself');
    return this.deps.db.insert('party_relationship', {
      from_party_id: input.fromPartyId,
      to_party_id: input.toPartyId,
      relation_type_id: this.deps.lookups.id('party_relation_type', input.relationTypeCode),
      description: input.description?.trim() || null,
      start_date: null,
      end_date: null,
    });
  }

  async searchOptions(query: string, limit = 12): Promise<Array<{ value: string; label: string; description?: string }>> {
    const { db } = this.deps;
    if (!query.trim()) {
      const page = await db.query('party', { orderBy: [{ column: 'display_name', direction: 'asc' }], limit });
      return page.rows.map((party) => ({
        value: String(party.id),
        label: String(party.display_name),
        description: party.kind === 'organization' ? 'شخص اعتباري' : 'شخص طبيعي',
      }));
    }
    const hits = (await db.searchPage(query, { entityType: 'party', limit: 40 })).hits;
    return hits.slice(0, limit).map((hit) => ({
      value: hit.entityId,
      label: hit.title,
      ...(hit.subtitle ? { description: hit.subtitle } : {}),
    }));
  }
}
