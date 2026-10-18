import { createHash } from 'node:crypto';
import type { SqlRow } from '../db/adapter.ts';
import { ConflictError, ValidationError } from '../errors.ts';
import type { NumberSeriesService } from '../services/number-series.ts';
import { getSyncEntity } from '../sync/entity-registry.ts';
import { assertIsoDate, toCanonicalTimestamp } from '../util/dates.ts';
import { stableStringify } from '../util/stable.ts';
import { BaseRepository, type EntityRecord, type RepositoryDependencies } from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';

export interface PartyRecord extends EntityRecord {
  readonly kind: 'person' | 'organization';
  readonly display_name: string;
  readonly status_id: string | null;
  readonly notes: string | null;
  readonly archived_at: string | null;
}

export interface PersonRecord extends EntityRecord {
  readonly party_id: string;
  readonly first_name: string;
  readonly middle_name: string | null;
  readonly last_name: string;
  readonly national_id: string | null;
  readonly national_id_type: string | null;
  readonly birth_date: string | null;
  readonly gender: string | null;
  readonly nationality: string | null;
  readonly marital_status_id: string | null;
  readonly occupation: string | null;
  readonly death_date: string | null;
}

export interface OrganizationRecord extends EntityRecord {
  readonly party_id: string;
  readonly legal_name: string;
  readonly trade_name: string | null;
  readonly legal_form_id: string | null;
  readonly commercial_registry_no: string | null;
  readonly tax_id: string | null;
  readonly established_on: string | null;
  readonly registry_office: string | null;
  readonly notes: string | null;
}

export interface ClientProfileRecord extends EntityRecord {
  readonly party_id: string;
  readonly client_code: string;
  readonly client_since: string | null;
  readonly status_id: string | null;
  readonly source_id: string | null;
  readonly notes: string | null;
}

export interface PartyFull {
  readonly party: PartyRecord;
  readonly person: PersonRecord | null;
  readonly organization: OrganizationRecord | null;
  readonly client: ClientProfileRecord | null;
  readonly contacts: ReadonlyArray<EntityRecord>;
  readonly addresses: ReadonlyArray<EntityRecord>;
  readonly aliases: ReadonlyArray<EntityRecord>;
}

export interface CreatePersonInput {
  firstName: string;
  middleName?: string;
  lastName: string;
  displayName?: string;
  nationalId?: string;
  nationalIdType?: 'national_id' | 'passport' | 'residence' | 'other';
  birthDate?: string;
  gender?: 'male' | 'female' | 'unknown';
  nationality?: string;
  maritalStatusCode?: string;
  occupation?: string;
  deathDate?: string;
  statusCode?: string;
  notes?: string;
}

export interface CreateOrganizationInput {
  legalName: string;
  displayName?: string;
  tradeName?: string;
  legalFormCode?: string;
  commercialRegistryNo?: string;
  taxId?: string;
  establishedOn?: string;
  registryOffice?: string;
  statusCode?: string;
  notes?: string;
}

export interface ClientOptions {
  clientCode?: string;
  clientSince?: string;
  statusCode?: string;
  sourceCode?: string;
  notes?: string;
}

const NATIONAL_ID_TYPES = new Set(['national_id', 'passport', 'residence', 'other']);
const GENDERS = new Set(['male', 'female', 'unknown']);

/**
 * Parties are shared across files. Being a client, an opponent, a witness or an
 * expert is expressed by roles on files/cases (`case_file_party`), never by
 * copying the person into each file. Historical proof is captured explicitly
 * with `captureSnapshot`, which stores a hashed JSON snapshot.
 */
export class PartyRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly numbers: NumberSeriesService;
  private readonly parties: BaseRepository<PartyRecord>;
  private readonly persons: BaseRepository<PersonRecord>;
  private readonly organizations: BaseRepository<OrganizationRecord>;
  private readonly clients: BaseRepository<ClientProfileRecord>;
  private readonly contacts: BaseRepository<EntityRecord>;
  private readonly addresses: BaseRepository<EntityRecord>;
  private readonly aliases: BaseRepository<EntityRecord>;
  private readonly relationships: BaseRepository<EntityRecord>;
  private readonly interactions: BaseRepository<EntityRecord>;
  private readonly snapshots: BaseRepository<EntityRecord>;

  constructor(
    deps: RepositoryDependencies,
    lookups: LookupRepository,
    numbers: NumberSeriesService,
  ) {
    this.deps = deps;
    this.lookups = lookups;
    this.numbers = numbers;
    this.parties = new BaseRepository<PartyRecord>(deps, getSyncEntity('party'));
    this.persons = new BaseRepository<PersonRecord>(deps, getSyncEntity('person'));
    this.organizations = new BaseRepository<OrganizationRecord>(deps, getSyncEntity('organization'));
    this.clients = new BaseRepository<ClientProfileRecord>(deps, getSyncEntity('client_profile'));
    this.contacts = new BaseRepository(deps, getSyncEntity('party_contact'));
    this.addresses = new BaseRepository(deps, getSyncEntity('party_address'));
    this.aliases = new BaseRepository(deps, getSyncEntity('party_alias'));
    this.relationships = new BaseRepository(deps, getSyncEntity('party_relationship'));
    this.interactions = new BaseRepository(deps, getSyncEntity('party_interaction'));
    this.snapshots = new BaseRepository(deps, getSyncEntity('party_snapshot'));
  }

  createPerson(input: CreatePersonInput): PartyFull {
    if (!input.firstName?.trim() || !input.lastName?.trim()) {
      throw new ValidationError('first and last names are required');
    }
    const displayName =
      input.displayName?.trim() ||
      [input.firstName, input.middleName, input.lastName].filter(Boolean).join(' ').trim();
    const nationalId = input.nationalId?.trim() || null;
    if (nationalId) this.assertNationalIdAvailable(nationalId);
    if (input.birthDate) assertIsoDate(input.birthDate, 'birthDate');
    if (input.deathDate) assertIsoDate(input.deathDate, 'deathDate');
    if (input.nationalIdType && !NATIONAL_ID_TYPES.has(input.nationalIdType)) {
      throw new ValidationError('invalid national id type');
    }
    if (input.gender && !GENDERS.has(input.gender)) {
      throw new ValidationError('invalid gender value');
    }

    return this.deps.db.transaction(() => {
      const party = this.parties.insert({
        kind: 'person',
        display_name: displayName,
        status_id: this.lookups.resolveOptional('party_status', input.statusCode ?? 'active'),
        notes: input.notes ?? null,
        archived_at: null,
      });
      this.persons.insert(
        {
          first_name: input.firstName.trim(),
          middle_name: input.middleName?.trim() || null,
          last_name: input.lastName.trim(),
          national_id: nationalId,
          national_id_type: input.nationalIdType ?? (nationalId ? 'national_id' : null),
          birth_date: input.birthDate ?? null,
          gender: input.gender ?? 'unknown',
          nationality: input.nationality ?? null,
          marital_status_id: this.lookups.resolveOptional('marital_status', input.maritalStatusCode),
          occupation: input.occupation ?? null,
          death_date: input.deathDate ?? null,
        },
        { id: party.id },
      );
      return this.requireFull(party.id);
    });
  }

  createOrganization(input: CreateOrganizationInput): PartyFull {
    if (!input.legalName?.trim()) throw new ValidationError('legal name is required');
    const displayName = input.displayName?.trim() || input.legalName.trim();
    if (input.establishedOn) assertIsoDate(input.establishedOn, 'establishedOn');

    return this.deps.db.transaction(() => {
      const party = this.parties.insert({
        kind: 'organization',
        display_name: displayName,
        status_id: this.lookups.resolveOptional('party_status', input.statusCode ?? 'active'),
        notes: input.notes ?? null,
        archived_at: null,
      });
      this.organizations.insert(
        {
          legal_name: input.legalName.trim(),
          trade_name: input.tradeName?.trim() || null,
          legal_form_id: this.lookups.resolveOptional('legal_form', input.legalFormCode),
          commercial_registry_no: input.commercialRegistryNo?.trim() || null,
          tax_id: input.taxId?.trim() || null,
          established_on: input.establishedOn ?? null,
          registry_office: input.registryOffice?.trim() || null,
          notes: input.notes ?? null,
        },
        { id: party.id },
      );
      return this.requireFull(party.id);
    });
  }

  createClientPerson(input: CreatePersonInput, clientOptions: ClientOptions = {}): PartyFull {
    return this.deps.db.transaction(() => {
      const created = this.createPerson(input);
      this.ensureClient(created.party.id, clientOptions);
      return this.requireFull(created.party.id);
    });
  }

  createClientOrganization(
    input: CreateOrganizationInput,
    clientOptions: ClientOptions = {},
  ): PartyFull {
    return this.deps.db.transaction(() => {
      const created = this.createOrganization(input);
      this.ensureClient(created.party.id, clientOptions);
      return this.requireFull(created.party.id);
    });
  }

  ensureClient(partyId: string, options: ClientOptions = {}): ClientProfileRecord {
    const party = this.parties.requireById(partyId);
    const existing = this.clients.getById(partyId, { includeDeleted: true });
    if (existing && existing.deleted_at === null) {
      throw new ConflictError('party already has a client profile', 'ALREADY_EXISTS', {
        partyId,
        clientCode: existing.client_code,
      });
    }
    const wasDeleted = Boolean(existing && existing.deleted_at !== null);
    if (wasDeleted) this.clients.restore(partyId);

    const clientCode = options.clientCode?.trim() || this.numbers.next('client.code').formatted;
    const duplicateCode = this.clients.list({
      filters: [{ column: 'client_code', value: clientCode }],
      includeDeleted: true,
      limit: 1,
    })[0];
    if (duplicateCode && duplicateCode.id !== partyId) {
      throw new ConflictError('client code already exists', 'ALREADY_EXISTS', { clientCode });
    }
    const values = {
      client_code: clientCode,
      client_since: options.clientSince ?? null,
      status_id: this.lookups.resolveOptional('client_status', options.statusCode ?? 'active'),
      source_id: this.lookups.resolveOptional('client_source', options.sourceCode),
      notes: options.notes ?? null,
      archived_at: null,
    };
    if (wasDeleted) return this.clients.update(partyId, values);
    return this.clients.insert(values, { id: party.id });
  }

  addContact(
    partyId: string,
    input: { typeCode: string; value: string; label?: string; isPrimary?: boolean },
  ): EntityRecord {
    this.parties.requireById(partyId);
    if (!input.value?.trim()) throw new ValidationError('contact value is required');
    return this.contacts.insert({
      party_id: partyId,
      contact_type_id: this.lookups.requireItemByCode('contact_type', input.typeCode, 'contact type').id,
      value: input.value.trim(),
      label: input.label ?? null,
      is_primary: input.isPrimary ? 1 : 0,
      verified_at: null,
    });
  }

  addAddress(
    partyId: string,
    input: {
      typeCode?: string;
      governorateCode?: string;
      city?: string;
      district?: string;
      street?: string;
      buildingNo?: string;
      floor?: string;
      apartment?: string;
      postalCode?: string;
      isPrimary?: boolean;
      notes?: string;
    },
  ): EntityRecord {
    this.parties.requireById(partyId);
    return this.addresses.insert({
      party_id: partyId,
      address_type_id: this.lookups.resolveOptional('address_type', input.typeCode),
      country: 'EG',
      governorate_id: this.lookups.resolveOptional('governorate', input.governorateCode),
      city: input.city ?? null,
      district: input.district ?? null,
      street: input.street ?? null,
      building_no: input.buildingNo ?? null,
      floor: input.floor ?? null,
      apartment: input.apartment ?? null,
      postal_code: input.postalCode ?? null,
      is_primary: input.isPrimary ? 1 : 0,
      notes: input.notes ?? null,
    });
  }

  addAlias(partyId: string, alias: string, kind?: string): EntityRecord {
    this.parties.requireById(partyId);
    if (!alias.trim()) throw new ValidationError('alias is required');
    return this.aliases.insert({
      party_id: partyId,
      alias: alias.trim(),
      kind: kind ?? null,
      notes: null,
    });
  }

  linkRelationship(input: {
    fromPartyId: string;
    toPartyId: string;
    relationTypeCode: string;
    description?: string;
    startDate?: string;
    endDate?: string;
  }): EntityRecord {
    this.parties.requireById(input.fromPartyId);
    this.parties.requireById(input.toPartyId);
    if (input.startDate) assertIsoDate(input.startDate, 'startDate');
    if (input.endDate) assertIsoDate(input.endDate, 'endDate');
    return this.relationships.insert({
      from_party_id: input.fromPartyId,
      to_party_id: input.toPartyId,
      relation_type_id: this.lookups.requireItemByCode(
        'party_relation_type',
        input.relationTypeCode,
        'relation type',
      ).id,
      description: input.description ?? null,
      start_date: input.startDate ?? null,
      end_date: input.endDate ?? null,
    });
  }

  addInteraction(
    partyId: string,
    input: {
      channelCode?: string;
      direction?: 'inbound' | 'outbound' | 'internal';
      occurredAt: string;
      summary: string;
      details?: string;
      followUpAt?: string;
      fileId?: string;
    },
  ): EntityRecord {
    this.parties.requireById(partyId);
    if (!input.summary?.trim()) throw new ValidationError('interaction summary is required');
    return this.interactions.insert({
      party_id: partyId,
      channel_id: this.lookups.resolveOptional('interaction_channel', input.channelCode),
      direction: input.direction ?? 'internal',
      occurred_at: input.occurredAt,
      summary: input.summary.trim(),
      details: input.details ?? null,
      follow_up_at: input.followUpAt ?? null,
      file_id: input.fileId ?? null,
    });
  }

  updatePerson(partyId: string, patch: Partial<CreatePersonInput>): PartyFull {
    const person = this.persons.getById(partyId);
    if (!person) throw new ValidationError('person not found for party');
    const update: Record<string, string | null> = {};
    if (patch.firstName !== undefined) update.first_name = patch.firstName.trim();
    if (patch.middleName !== undefined) update.middle_name = patch.middleName?.trim() || null;
    if (patch.lastName !== undefined) update.last_name = patch.lastName.trim();
    if (patch.nationalId !== undefined) {
      const nationalId = patch.nationalId?.trim() || null;
      if (nationalId && nationalId !== person.national_id) this.assertNationalIdAvailable(nationalId);
      update.national_id = nationalId;
    }
    if (patch.birthDate !== undefined) {
      if (patch.birthDate) assertIsoDate(patch.birthDate, 'birthDate');
      update.birth_date = patch.birthDate ?? null;
    }
    if (patch.deathDate !== undefined) {
      if (patch.deathDate) assertIsoDate(patch.deathDate, 'deathDate');
      update.death_date = patch.deathDate ?? null;
    }
    if (patch.nationality !== undefined) update.nationality = patch.nationality;
    if (patch.occupation !== undefined) update.occupation = patch.occupation;
    if (patch.gender !== undefined) {
      if (!GENDERS.has(patch.gender)) throw new ValidationError('invalid gender value');
      update.gender = patch.gender;
    }
    if (patch.maritalStatusCode !== undefined) {
      update.marital_status_id = this.lookups.resolveOptional('marital_status', patch.maritalStatusCode);
    }
    if (Object.keys(update).length > 0) this.persons.update(partyId, update);

    if (patch.displayName !== undefined && patch.displayName.trim()) {
      this.parties.update(partyId, { display_name: patch.displayName.trim() });
    }
    return this.requireFull(partyId);
  }

  updateOrganization(partyId: string, patch: Partial<CreateOrganizationInput>): PartyFull {
    const org = this.organizations.getById(partyId);
    if (!org) throw new ValidationError('organization not found for party');
    const update: Record<string, string | null> = {};
    if (patch.legalName !== undefined) update.legal_name = patch.legalName.trim();
    if (patch.tradeName !== undefined) update.trade_name = patch.tradeName?.trim() || null;
    if (patch.legalFormCode !== undefined) {
      update.legal_form_id = this.lookups.resolveOptional('legal_form', patch.legalFormCode);
    }
    if (patch.commercialRegistryNo !== undefined) {
      update.commercial_registry_no = patch.commercialRegistryNo?.trim() || null;
    }
    if (patch.taxId !== undefined) update.tax_id = patch.taxId?.trim() || null;
    if (patch.establishedOn !== undefined) {
      if (patch.establishedOn) assertIsoDate(patch.establishedOn, 'establishedOn');
      update.established_on = patch.establishedOn ?? null;
    }
    if (patch.registryOffice !== undefined) update.registry_office = patch.registryOffice?.trim() || null;
    if (Object.keys(update).length > 0) this.organizations.update(partyId, update);
    if (patch.displayName !== undefined && patch.displayName.trim()) {
      this.parties.update(partyId, { display_name: patch.displayName.trim() });
    }
    return this.requireFull(partyId);
  }

  updateParty(partyId: string, patch: { statusCode?: string; notes?: string; displayName?: string }): PartyRecord {
    const update: Record<string, string | null> = {};
    if (patch.statusCode !== undefined) {
      update.status_id = this.lookups.resolveOptional('party_status', patch.statusCode);
    }
    if (patch.notes !== undefined) update.notes = patch.notes;
    if (patch.displayName !== undefined) update.display_name = patch.displayName.trim();
    return Object.keys(update).length === 0
      ? this.parties.requireById(partyId)
      : this.parties.update(partyId, update);
  }

  getParty(partyId: string): PartyRecord {
    return this.parties.requireById(partyId);
  }

  getFull(partyId: string, includeDeleted = false): PartyFull | undefined {
    const party = this.parties.getById(partyId, { includeDeleted });
    if (!party) return undefined;
    return {
      party,
      person: this.persons.getById(partyId, { includeDeleted }) ?? null,
      organization: this.organizations.getById(partyId, { includeDeleted }) ?? null,
      client: this.clients.getById(partyId, { includeDeleted }) ?? null,
      contacts: this.contacts.list({
        filters: [{ column: 'party_id', value: partyId }],
        includeDeleted,
        limit: 200,
      }),
      addresses: this.addresses.list({
        filters: [{ column: 'party_id', value: partyId }],
        includeDeleted,
        limit: 100,
      }),
      aliases: this.aliases.list({
        filters: [{ column: 'party_id', value: partyId }],
        includeDeleted,
        limit: 100,
      }),
    };
  }

  requireFull(partyId: string): PartyFull {
    const full = this.getFull(partyId);
    if (!full) throw new ValidationError(`party ${partyId} not found`);
    return full;
  }

  findByNationalId(nationalId: string, includeDeleted = false): PartyFull | undefined {
    const row = this.deps.db.get<{ party_id: string }>(
      `SELECT p.party_id FROM person p JOIN party pa ON pa.id = p.party_id
       WHERE p.national_id = ? ${includeDeleted ? '' : 'AND pa.deleted_at IS NULL'}
       LIMIT 1`,
      [nationalId],
    );
    return row ? this.getFull(row.party_id, includeDeleted) : undefined;
  }

  listPersons(options: { limit?: number; offset?: number } = {}): PartyRecord[] {
    return this.parties.list({
      filters: [{ column: 'kind', value: 'person' }],
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      orderBy: { column: 'display_name', direction: 'asc' },
    });
  }

  listClients(options: { limit?: number; offset?: number } = {}): PartyRecord[] {
    return this.deps.db
      .query<SqlRow>(
        `SELECT p.* FROM party p
         JOIN client_profile cp ON cp.party_id = p.id
         WHERE p.deleted_at IS NULL AND cp.deleted_at IS NULL
         ORDER BY p.display_name
         LIMIT ? OFFSET ?`,
        [options.limit ?? 50, options.offset ?? 0],
      )
      .map((row) => ({ ...row, id: String(row.id) })) as unknown as PartyRecord[];
  }

  /**
   * Stores an immutable, hashed snapshot of the party as it exists now. This
   * is the supported way to prove historical data without duplicating the
   * person into every file.
   */
  captureSnapshot(partyId: string, reason: string): EntityRecord {
    if (!reason.trim()) throw new ValidationError('snapshot reason is required');
    const full = this.requireFull(partyId);
    const payload = {
      party: full.party,
      person: full.person,
      organization: full.organization,
      client: full.client,
      contacts: full.contacts,
      addresses: full.addresses,
      aliases: full.aliases,
    };
    const json = stableStringify(payload);
    const hash = createHash('sha256').update(json, 'utf8').digest('hex');
    return this.snapshots.insert({
      party_id: partyId,
      captured_at: toCanonicalTimestamp(this.deps.clock.now()),
      reason: reason.trim(),
      snapshot_json: json,
      snapshot_hash: hash,
    });
  }

  archive(partyId: string): PartyRecord {
    return this.parties.archive(partyId);
  }

  unarchive(partyId: string): PartyRecord {
    return this.parties.unarchive(partyId);
  }

  softDelete(partyId: string, reason?: string): { batchId: string; affectedCount: number } {
    return this.parties.softDelete(partyId, { ...(reason === undefined ? {} : { reason }) });
  }

  restore(partyId: string): { batchId: string | null; restoredCount: number } {
    return this.parties.restore(partyId);
  }

  private assertNationalIdAvailable(nationalId: string): void {
    const existing = this.findByNationalId(nationalId, true);
    if (existing) {
      throw new ConflictError('national id belongs to another party', 'ALREADY_EXISTS', {
        partyId: existing.party.id,
        deleted: existing.party.deleted_at !== null,
      });
    }
  }
}
