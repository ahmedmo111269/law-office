import type { EngineRow } from '../../portable/store.ts';
import { ConflictError, ValidationError } from '../../errors.ts';
import type { PartyOption, ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';

export interface ClientRow {
  party: EngineRow;
  client: EngineRow;
  phone: string | null;
  email: string | null;
  filesCount: number;
  lastActivity: string;
}

export interface ClientDetail {
  party: EngineRow;
  person: EngineRow | null;
  organization: EngineRow | null;
  client: EngineRow;
  contacts: EngineRow[];
  addresses: EngineRow[];
  files: Array<{ file: EngineRow; roleName: string; sideName: string; isPrimary: boolean }>;
  charges: EngineRow[];
  transactions: EngineRow[];
  outstandingMinor: number;
  paidMinor: number;
  activity: EngineRow[];
}

export interface ClientInput {
  kind: 'person' | 'organization';
  firstName?: string;
  middleName?: string;
  lastName?: string;
  legalName?: string;
  tradeName?: string;
  legalFormCode?: string;
  nationalId?: string;
  birthDate?: string;
  gender?: 'male' | 'female' | 'unknown';
  occupation?: string;
  taxId?: string;
  commercialRegistryNo?: string;
  phone?: string;
  email?: string;
  statusCode?: string;
  sourceCode?: string;
  notes?: string;
}

export class ClientService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async list(request: TableRequest): Promise<TableResult<ClientRow>> {
    const { db, lookups, cache } = this.deps;
    const statusId = request.filters.status ? lookups.id('client_status', request.filters.status) : null;
    if (request.search.trim()) {
      const all = await collectPartySearch(db, request.search.trim());
      const clientProfiles = new Map<string, EngineRow>();
      for (const hit of all) {
        const profile = await db.get('client_profile', hit.entityId);
        if (profile) clientProfiles.set(hit.entityId, profile);
      }
      let ids = [...clientProfiles.keys()];
      if (statusId) {
        ids = ids.filter((id) => String(clientProfiles.get(id)?.status_id ?? '') === statusId);
      }
      const parties = await cache.many('party', ids);
      let rows = ids
        .map((id) => ({ party: parties.get(id), client: clientProfiles.get(id) }))
        .filter((entry): entry is { party: EngineRow; client: EngineRow } => Boolean(entry.party && entry.client));
      rows = sortClients(rows, request.sortKey, request.sortDir);
      const total = rows.length;
      const { offset, limit } = paginate(request.page, request.pageSize);
      return {
        rows: await this.enrich(rows.slice(offset, offset + limit)),
        total,
      };
    }

    const sortKey = request.sortKey === 'client_code' ? 'client_code' : 'client_since';
    const direction = request.sortDir ?? (sortKey === 'client_since' ? 'desc' : 'asc');
    const page = await db.query('client_profile', {
      ...(statusId ? { filters: [{ column: 'status_id', op: 'eq', value: statusId }] } : {}),
      orderBy: [{ column: sortKey, direction }],
      ...paginate(request.page, request.pageSize),
    });
    const parties = await cache.many('party', page.rows.map((client) => String(client.party_id)));
    const pairs = page.rows
      .map((client) => ({ client, party: parties.get(String(client.party_id)) }))
      .filter((entry): entry is { client: EngineRow; party: EngineRow } => Boolean(entry.party));
    return { rows: await this.enrich(pairs), total: page.total };
  }

  private async enrich(pairs: ReadonlyArray<{ party: EngineRow; client: EngineRow }>): Promise<ClientRow[]> {
    const { db, cache } = this.deps;
    if (pairs.length === 0) return [];
    const ids = pairs.map((pair) => String(pair.party.id));
    const contactPage = await db.query('party_contact', {
      filters: [{ column: 'party_id', op: 'in', value: ids }],
      limit: Math.min(500, Math.max(10, ids.length * 4)),
    });
    const contactsByParty = new Map<string, EngineRow[]>();
    for (const contact of contactPage.rows) {
      if (contact.deleted_at !== null) continue;
      const key = String(contact.party_id);
      const list = contactsByParty.get(key) ?? [];
      list.push(contact);
      contactsByParty.set(key, list);
    }
    const rows: ClientRow[] = [];
    for (const pair of pairs) {
      const partyId = String(pair.party.id);
      const contacts = contactsByParty.get(partyId) ?? [];
      const phoneContact = pickContact(contacts, ['mobile', 'phone', 'whatsapp'], this.deps.lookups);
      const emailContact = pickContact(contacts, ['email'], this.deps.lookups);
      const files = await db.query('case_file_party', {
        filters: [{ column: 'party_id', op: 'eq', value: partyId }],
        limit: 0,
      });
      rows.push({
        party: pair.party,
        client: pair.client,
        phone: phoneContact ? String(phoneContact.value) : null,
        email: emailContact ? String(emailContact.value) : null,
        filesCount: files.total,
        lastActivity: String(pair.party.updated_at ?? pair.party.created_at ?? ''),
      });
    }
    void cache;
    return rows;
  }

  async get(partyId: string): Promise<ClientDetail | null> {
    const { db } = this.deps;
    const full = (await db.getPartyFull(partyId)) as {
      party: EngineRow;
      person: EngineRow | null;
      organization: EngineRow | null;
      client: EngineRow | null;
      contacts: EngineRow[];
      addresses: EngineRow[];
    } | null;
    if (!full || !full.client) return null;
    const links = await db.query('case_file_party', {
      filters: [{ column: 'party_id', op: 'eq', value: partyId }],
      limit: 100,
    });
    const files: ClientDetail['files'] = [];
    for (const link of links.rows) {
      if (link.file_id === null) continue;
      const file = await db.get('case_file', String(link.file_id));
      if (!file) continue;
      files.push({
        file,
        roleName: this.deps.lookups.byId(String(link.role_id ?? ''))?.nameAr ?? '—',
        sideName: this.deps.lookups.byId(String(link.side_id ?? ''))?.nameAr ?? '—',
        isPrimary: link.is_primary === 1,
      });
    }
    const charges = (await db.query('financial_charge', {
      filters: [{ column: 'client_party_id', op: 'eq', value: partyId }],
      orderBy: [{ column: 'issued_on', direction: 'desc' }],
      limit: 100,
    })).rows;
    let outstandingMinor = 0;
    let paidMinor = 0;
    for (const charge of charges) {
      if (String(charge.status_id) === String(this.deps.lookups.id('charge_status', 'cancelled'))) continue;
      const balance = await db.chargeBalance(String(charge.id));
      outstandingMinor += Math.max(0, balance.outstandingMinor);
      paidMinor += balance.paidMinor;
    }
    const transactions = (await db.query('financial_transaction', {
      filters: [{ column: 'client_party_id', op: 'eq', value: partyId }],
      orderBy: [{ column: 'occurred_at', direction: 'desc' }],
      limit: 25,
    })).rows;
    const activity = await db.auditTrail('party', partyId, 30);
    return {
      party: full.party,
      person: full.person,
      organization: full.organization,
      client: full.client,
      contacts: full.contacts,
      addresses: full.addresses,
      files,
      charges,
      transactions,
      outstandingMinor,
      paidMinor,
      activity,
    };
  }

  async create(input: ClientInput): Promise<EngineRow> {
    const { db } = this.deps;
    const statusId = input.statusCode ? this.deps.lookups.id('client_status', input.statusCode) : null;
    const sourceId = input.sourceCode ? this.deps.lookups.id('client_source', input.sourceCode) : null;
    let created: { party: EngineRow; client: EngineRow | null } | null = null;
    if (input.kind === 'person') {
      if (input.nationalId?.trim()) {
        const duplicate = await db.query('person', {
          filters: [{ column: 'national_id', op: 'eq', value: input.nationalId.trim() }],
          limit: 1,
        });
        const existing = duplicate.rows[0];
        if (existing) {
          const party = await db.get('party', String(existing.party_id));
          if (party) {
            throw new ConflictError('national id already exists', 'ALREADY_EXISTS', {
              partyId: party.id,
              displayName: party.display_name,
            });
          }
        }
      }
      const result = (await db.createPerson(
        {
          firstName: input.firstName?.trim() ?? '',
          ...(input.middleName?.trim() ? { middleName: input.middleName.trim() } : {}),
          lastName: input.lastName?.trim() ?? '',
          ...(input.nationalId?.trim() ? { nationalId: input.nationalId.trim() } : {}),
          ...(input.birthDate ? { birthDate: input.birthDate } : {}),
          ...(input.gender ? { gender: input.gender } : {}),
          ...(input.occupation?.trim() ? { occupation: input.occupation.trim() } : {}),
          ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
        },
        { client: true },
      )) as unknown as { party: EngineRow; client: EngineRow | null };
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
        { client: true },
      )) as unknown as { party: EngineRow; client: EngineRow | null };
      created = result;
    }
    if (!created) throw new ValidationError('client was not created');
    if (statusId || sourceId) {
      await db.update('client_profile', String(created.party.id), {
        ...(statusId ? { status_id: statusId } : {}),
        ...(sourceId ? { source_id: sourceId } : {}),
      });
    }
    if (input.phone?.trim()) {
      await db.addContact(String(created.party.id), { typeCode: 'mobile', value: input.phone.trim(), isPrimary: true });
    }
    if (input.email?.trim()) {
      await db.addContact(String(created.party.id), { typeCode: 'email', value: input.email.trim(), isPrimary: false });
    }
    return created.party;
  }

  async update(detail: ClientDetail, input: ClientInput & { displayName?: string }): Promise<void> {
    const { db } = this.deps;
    const partyId = String(detail.party.id);
    const partyPatch: Record<string, unknown> = {};
    if (input.displayName?.trim()) partyPatch.display_name = input.displayName.trim();
    if (input.notes !== undefined) partyPatch.notes = input.notes.trim() || null;
    if (Object.keys(partyPatch).length > 0) await db.update('party', partyId, partyPatch);

    if (input.kind === 'person') {
      const personPatch: Record<string, unknown> = {
        first_name: input.firstName?.trim() || detail.person?.first_name || '',
        middle_name: input.middleName?.trim() || null,
        last_name: input.lastName?.trim() || detail.person?.last_name || '',
        national_id: input.nationalId?.trim() || null,
        birth_date: input.birthDate || null,
        gender: input.gender ?? 'unknown',
        occupation: input.occupation?.trim() || null,
      };
      await db.update('person', partyId, personPatch);
      if (!input.displayName?.trim()) {
        const display = [input.firstName, input.middleName, input.lastName].filter(Boolean).join(' ').trim();
        if (display) await db.update('party', partyId, { display_name: display });
      }
    } else {
      await db.update('organization', partyId, {
        legal_name: input.legalName?.trim() || detail.organization?.legal_name || '',
        trade_name: input.tradeName?.trim() || null,
        legal_form_id: this.deps.lookups.id('legal_form', input.legalFormCode ?? null),
        commercial_registry_no: input.commercialRegistryNo?.trim() || null,
        tax_id: input.taxId?.trim() || null,
        notes: input.notes?.trim() || null,
      });
      if (!input.displayName?.trim()) {
        const display = input.tradeName?.trim() || input.legalName?.trim();
        if (display) await db.update('party', partyId, { display_name: display });
      }
    }

    const statusId = input.statusCode ? this.deps.lookups.id('client_status', input.statusCode) : null;
    const sourceId = input.sourceCode ? this.deps.lookups.id('client_source', input.sourceCode) : null;
    await db.update('client_profile', partyId, {
      ...(statusId ? { status_id: statusId } : {}),
      ...(sourceId ? { source_id: sourceId } : {}),
      ...(input.notes !== undefined ? { notes: input.notes.trim() || null } : {}),
    });
    this.deps.cache.invalidate();
  }

  async addContact(partyId: string, typeCode: string, value: string, isPrimary = false): Promise<EngineRow> {
    if (!value.trim()) throw new ValidationError('contact value is required');
    const contact = await this.deps.db.addContact(partyId, { typeCode, value: value.trim(), isPrimary });
    this.deps.cache.invalidate();
    return contact;
  }

  async removeContact(contactId: string): Promise<void> {
    await this.deps.db.softDelete('party_contact', contactId, 'حذف وسيلة اتصال');
    this.deps.cache.invalidate();
  }

  async addAddress(partyId: string, input: {
    typeCode?: string;
    city?: string;
    district?: string;
    street?: string;
    buildingNo?: string;
    floor?: string;
    apartment?: string;
    governorateCode?: string;
    isPrimary?: boolean;
  }): Promise<EngineRow> {
    const address = await this.deps.db.insert('party_address', {
      party_id: partyId,
      address_type_id: this.deps.lookups.id('address_type', input.typeCode ?? 'residential'),
      country: 'EG',
      governorate_id: this.deps.lookups.id('governorate', input.governorateCode ?? null),
      city: input.city?.trim() || null,
      district: input.district?.trim() || null,
      street: input.street?.trim() || null,
      building_no: input.buildingNo?.trim() || null,
      floor: input.floor?.trim() || null,
      apartment: input.apartment?.trim() || null,
      postal_code: null,
      is_primary: input.isPrimary ? 1 : 0,
      notes: null,
    });
    this.deps.cache.invalidate();
    return address;
  }

  async removeAddress(addressId: string): Promise<void> {
    await this.deps.db.softDelete('party_address', addressId, 'حذف عنوان');
  }

  async archive(partyId: string, archived: boolean, reason: string): Promise<void> {
    if (archived) {
      await this.deps.db.softDelete('party', partyId, reason);
    } else {
      await this.deps.db.restore('party', partyId);
    }
    this.deps.cache.invalidate();
  }

  async searchOptions(query: string, clientsOnly = true, limit = 12): Promise<PartyOption[]> {
    const { db, lookups, cache } = this.deps;
    const trimmed = query.trim();
    const options: PartyOption[] = [];
    if (!trimmed) {
      const recent = await db.query('client_profile', {
        ...(clientsOnly ? {} : {}),
        orderBy: [{ column: 'client_since', direction: 'desc' }],
        limit,
      });
      const parties = await cache.many('party', recent.rows.map((row) => String(row.party_id)));
      for (const row of recent.rows) {
        const party = parties.get(String(row.party_id));
        if (party) options.push(toPartyOption(party, row, lookups));
      }
      return options;
    }
    const hits = (await db.searchPage(trimmed, { entityType: 'party', limit: 200 })).hits;
    const clientCodes = new Map<string, EngineRow>();
    for (const hit of hits.slice(0, limit * 4)) {
      const party = await cache.get('party', hit.entityId);
      if (!party) continue;
      const client = await db.get('client_profile', hit.entityId);
      if (clientsOnly && !client) continue;
      options.push(toPartyOption(party, client, lookups));
      if (options.length >= limit) break;
    }
    void clientCodes;
    return options;
  }

  async getClientProfile(partyId: string): Promise<EngineRow | null> {
    return (await this.deps.db.get('client_profile', partyId)) ?? null;
  }
}

function toPartyOption(party: EngineRow, client: EngineRow | null | undefined, lookups: ServiceDeps['lookups']): PartyOption {
  const code = client?.client_code ? String(client.client_code) : null;
  const status = lookups.byId(String(client?.status_id ?? ''))?.nameAr;
  return {
    value: String(party.id),
    label: String(party.display_name),
    ...(code ? { description: code } : {}),
    ...(status ? { badge: status } : {}),
  };
}

function pickContact(contacts: readonly EngineRow[], typeCodes: readonly string[], lookups: ServiceDeps['lookups']): EngineRow | null {
  const wanted = new Set(typeCodes.map((code) => lookups.id('contact_type', code)).filter(Boolean));
  const matching = contacts.filter((contact) => wanted.has(String(contact.contact_type_id)));
  matching.sort((left, right) => Number(right.is_primary ?? 0) - Number(left.is_primary ?? 0));
  return matching[0] ?? null;
}

function sortClients(
  rows: Array<{ party: EngineRow; client: EngineRow }>,
  sortKey: string | undefined,
  sortDir: 'asc' | 'desc' | undefined,
): Array<{ party: EngineRow; client: EngineRow }> {
  const direction = sortDir === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    let a: string;
    let b: string;
    if (sortKey === 'client_code') {
      a = String(left.client.client_code);
      b = String(right.client.client_code);
    } else if (sortKey === 'name') {
      a = String(left.party.display_name);
      b = String(right.party.display_name);
    } else {
      a = String(left.client.client_since ?? '');
      b = String(right.client.client_since ?? '');
    }
    return a.localeCompare(b, 'ar') * direction;
  });
}

/** Collects search hits across pages so client search keeps an exact total. */
export async function collectPartySearch(
  db: ServiceDeps['db'],
  query: string,
): Promise<Array<{ entityType: string; entityId: string; title: string }>> {
  const hits: Array<{ entityType: string; entityId: string; title: string }> = [];
  let offset = 0;
  for (;;) {
    const page = await db.searchPage(query, { entityType: 'party', limit: 200, offset });
    hits.push(...page.hits);
    offset += page.hits.length;
    if (page.hits.length === 0 || offset >= page.total || offset >= 2000) break;
  }
  return hits;
}
