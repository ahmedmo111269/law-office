import type { DatabaseAdapter, SqlRow, SqlValue } from '../db/adapter.ts';
import { detectFts5 } from '../db/capabilities.ts';
import { SEARCH_FTS_DDL } from '../schema/v1/ddl.ts';
import type { Clock } from '../util/clock.ts';
import { normalizeArabic, buildSearchBody } from '../util/arabic.ts';
import { ValidationError } from '../errors.ts';
import { toCanonicalTimestamp } from '../util/dates.ts';
import type { SearchIndexPort } from './search-port.ts';

export interface SearchHit {
  readonly entityType: string;
  readonly entityId: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly snippet: string;
  readonly rank: number;
}

export interface SearchOptions {
  readonly entityType?: string;
  readonly limit?: number;
  readonly offset?: number;
}

interface DocumentParts {
  readonly title: string;
  readonly subtitle: string | null;
  readonly body: string;
}

const INDEXED_TYPES = new Set([
  'party',
  'case_file',
  'legal_case',
  'hearing',
  'judgment',
  'task',
  'document',
  'contract',
  'power_of_attorney',
  'appointment',
  'case_note',
  'court',
  'party_interaction',
]);

function value(row: SqlRow | undefined, key: string): string | null {
  if (!row) return null;
  const raw = row[key];
  if (raw === null || raw === undefined) return null;
  return String(raw);
}

function joinNonEmpty(parts: ReadonlyArray<string | null | undefined>, separator = '\n'): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join(separator);
}

/**
 * Derived local search index.
 *
 * Original text is preserved in its canonical tables. `normalized_text` is a
 * search-only projection that folds Arabic hamza/alef/yaa/taa-marbuta variants
 * and diacritics. When FTS5 is available, a contentless external-content FTS5
 * table is maintained by triggers; otherwise queries fall back to LIKE over
 * `normalized_text`. The index is rebuildable and never a source of truth.
 */
export class SearchService implements SearchIndexPort {
  private readonly db: DatabaseAdapter;
  private readonly clock: Clock;
  private ftsAvailable = false;

  constructor(db: DatabaseAdapter, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  get usingFts5(): boolean {
    return this.ftsAvailable;
  }

  initialize(options: { rebuildIfFlagged?: boolean } = {}): void {
    const available = detectFts5(this.db);
    this.ftsAvailable = available;

    if (available) {
      const hadTable =
        this.db.get("SELECT name FROM sqlite_master WHERE name = 'search_fts'") !== undefined;
      this.db.exec(SEARCH_FTS_DDL);
      if (!hadTable) {
        // External-content index can be rebuilt from the canonical search docs.
        this.db.exec("INSERT INTO search_fts(search_fts) VALUES('rebuild')");
      }
      this.setMeta('search.fts5', '1');
    } else {
      this.setMeta('search.fts5', '0');
    }

    const rebuildRequired = this.readMeta('search.rebuild_required') === '1';
    if (rebuildRequired && (options.rebuildIfFlagged ?? true)) {
      this.rebuildAll();
    }
  }

  handleEntityChange(tx: DatabaseAdapter, entityType: string, entityId: string): void {
    if (INDEXED_TYPES.has(entityType)) {
      this.refreshOne(tx, entityType, entityId);
      this.refreshDependents(tx, entityType, entityId);
      return;
    }
    this.refreshRelated(tx, entityType, entityId);
  }

  search(query: string, options: SearchOptions = {}): SearchHit[] {
    const normalized = normalizeArabic(query);
    const tokens = [...new Set(normalized.split(/\s+/).filter(Boolean))].slice(0, 20);
    if (tokens.length === 0) return [];

    const limit = Math.trunc(options.limit ?? 20);
    const offset = Math.trunc(options.offset ?? 0);
    if (limit <= 0) throw new ValidationError('limit must be greater than zero');
    if (offset < 0) throw new ValidationError('offset must not be negative');

    if (this.ftsAvailable && this.hasFtsTable()) {
      try {
        return this.searchFts(tokens, options.entityType, limit, offset);
      } catch {
        // A malformed FTS query or a damaged derived index degrades to LIKE.
        this.setMeta('search.rebuild_required', '1');
      }
    }
    return this.searchLike(tokens, options.entityType, limit, offset);
  }

  private searchFts(
    tokens: readonly string[],
    entityType: string | undefined,
    limit: number,
    offset: number,
  ): SearchHit[] {
    const match = tokens
      .map((token) => `"${token.replace(/"/g, '""')}"*`)
      .join(' AND ');
    const params: SqlValue[] = [match];
    let filter = '';
    if (entityType) {
      filter = ' AND d.entity_type = ?';
      params.push(entityType);
    }
    params.push(limit, offset);
    const rows = this.db.query<SqlRow>(
      `SELECT d.entity_type AS entity_type, d.entity_id AS entity_id, d.title AS title,
              d.subtitle AS subtitle,
              snippet(search_fts, 2, '«', '»', '…', 28) AS snippet,
              bm25(search_fts) AS rank
       FROM search_fts
       JOIN search_document d ON d.id = search_fts.rowid
       WHERE search_fts MATCH ?${filter}
       ORDER BY rank ASC, d.updated_at DESC
       LIMIT ? OFFSET ?`,
      params,
    );
    return rows.map((row) => ({
      entityType: String(row.entity_type),
      entityId: String(row.entity_id),
      title: String(row.title),
      subtitle: row.subtitle === null ? null : String(row.subtitle),
      snippet: String(row.snippet ?? ''),
      rank: Number(row.rank ?? 0),
    }));
  }

  private searchLike(
    tokens: readonly string[],
    entityType: string | undefined,
    limit: number,
    offset: number,
  ): SearchHit[] {
    const conditions = tokens.map(() => "normalized_text LIKE ? ESCAPE '\\'");
    const params: SqlValue[] = tokens.map((token) => `%${escapeLike(token)}%`);
    let filter = '';
    if (entityType) {
      filter = ' AND entity_type = ?';
      params.push(entityType);
    }
    params.push(limit, offset);
    const rows = this.db.query<SqlRow>(
      `SELECT entity_type, entity_id, title, subtitle, body
       FROM search_document
       WHERE ${conditions.join(' AND ')}${filter}
       ORDER BY updated_at DESC
       LIMIT ? OFFSET ?`,
      params,
    );
    return rows.map((row, index) => {
      const body = String(row.body ?? '');
      return {
        entityType: String(row.entity_type),
        entityId: String(row.entity_id),
        title: String(row.title),
        subtitle: row.subtitle === null ? null : String(row.subtitle),
        snippet: makeSnippet(body, tokens[0] ?? ''),
        rank: index,
      };
    });
  }

  rebuildAll(): { documents: number; fts5: boolean } {
    const started = Date.now();
    this.ftsAvailable = detectFts5(this.db);
    if (this.ftsAvailable) this.db.exec(SEARCH_FTS_DDL);

    let documents = 0;
    this.db.transaction((tx) => {
      tx.exec('DELETE FROM search_document');
      for (const entityType of INDEXED_TYPES) {
        const table = tableForType(entityType);
        if (!table) continue;
        let lastRowid = 0;
        for (;;) {
          const rows = tx.query<{ rid: number; eid: string }>(
            `SELECT rowid AS rid, id AS eid FROM "${table}"
             WHERE deleted_at IS NULL AND rowid > ? ORDER BY rowid LIMIT 500`,
            [lastRowid],
          );
          if (rows.length === 0) break;
          for (const row of rows) {
            const parts = this.buildDocument(tx, entityType, row.eid);
            if (parts) {
              this.upsertDocument(tx, entityType, row.eid, parts);
              documents += 1;
            }
            lastRowid = row.rid;
          }
          if (rows.length < 500) break;
        }
      }
      if (this.ftsAvailable) {
        tx.exec("INSERT INTO search_fts(search_fts) VALUES('rebuild')");
      }
      tx.run(
        `INSERT INTO app_meta (key, value, updated_at) VALUES ('search.rebuild_required', '0', ?)
         ON CONFLICT(key) DO UPDATE SET value = '0', updated_at = excluded.updated_at`,
        [toCanonicalTimestamp(this.clock.now())],
      );
      tx.run(
        `INSERT INTO app_meta (key, value, updated_at) VALUES ('search.last_rebuild_ms', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [String(Date.now() - started), toCanonicalTimestamp(this.clock.now())],
      );
    });
    return { documents, fts5: this.ftsAvailable };
  }

  count(): number {
    return this.db.get<{ c: number }>('SELECT COUNT(*) AS c FROM search_document')?.c ?? 0;
  }

  private refreshOne(tx: DatabaseAdapter, entityType: string, entityId: string): void {
    const table = tableForType(entityType);
    if (!table) {
      this.deleteDocument(tx, entityType, entityId);
      return;
    }
    const row = tx.get<SqlRow>(
      `SELECT id, deleted_at FROM "${table}" WHERE id = ?`,
      [entityId],
    );
    if (!row || row.deleted_at !== null) {
      this.deleteDocument(tx, entityType, entityId);
      return;
    }
    const parts = this.buildDocument(tx, entityType, entityId);
    if (!parts) {
      this.deleteDocument(tx, entityType, entityId);
      return;
    }
    this.upsertDocument(tx, entityType, entityId, parts);
  }

  private refreshRelated(tx: DatabaseAdapter, entityType: string, entityId: string): void {
    switch (entityType) {
      case 'person':
      case 'organization':
      case 'client_profile':
      case 'party_contact':
      case 'party_address':
      case 'party_alias': {
        const row = this.anyRow(tx, tableForType(entityType), entityId);
        const partyId = value(row, 'party_id');
        if (partyId) {
          this.refreshOne(tx, 'party', partyId);
          this.refreshPartyDependents(tx, partyId);
        }
        return;
      }
      case 'party_relationship': {
        const row = this.anyRow(tx, 'party_relationship', entityId);
        for (const partyId of [value(row, 'from_party_id'), value(row, 'to_party_id')]) {
          if (partyId) {
            this.refreshOne(tx, 'party', partyId);
            this.refreshPartyDependents(tx, partyId);
          }
        }
        return;
      }
      case 'case_file_party': {
        const row = this.anyRow(tx, 'case_file_party', entityId);
        const fileId = value(row, 'file_id');
        const caseId = value(row, 'case_id');
        if (fileId) this.refreshOne(tx, 'case_file', fileId);
        if (caseId) this.refreshOne(tx, 'legal_case', caseId);
        return;
      }
      case 'case_file_case': {
        const row = this.anyRow(tx, 'case_file_case', entityId);
        const fileId = value(row, 'file_id');
        const caseId = value(row, 'case_id');
        if (fileId) this.refreshOne(tx, 'case_file', fileId);
        if (caseId) this.refreshOne(tx, 'legal_case', caseId);
        return;
      }
      case 'case_file_link': {
        const row = this.anyRow(tx, 'case_file_link', entityId);
        for (const fileId of [value(row, 'source_file_id'), value(row, 'target_file_id')]) {
          if (fileId) this.refreshOne(tx, 'case_file', fileId);
        }
        return;
      }
      case 'legal_case_link': {
        const row = this.anyRow(tx, 'legal_case_link', entityId);
        for (const caseId of [value(row, 'source_case_id'), value(row, 'target_case_id')]) {
          if (caseId) this.refreshOne(tx, 'legal_case', caseId);
        }
        return;
      }
      case 'document_version':
      case 'document_link': {
        const row = this.anyRow(tx, tableForType(entityType), entityId);
        const documentId = value(row, 'document_id');
        if (documentId) this.refreshOne(tx, 'document', documentId);
        return;
      }
      case 'contract_party': {
        const row = this.anyRow(tx, 'contract_party', entityId);
        const contractId = value(row, 'contract_id');
        if (contractId) this.refreshOne(tx, 'contract', contractId);
        return;
      }
      case 'judgment_appeal': {
        const row = this.anyRow(tx, 'judgment_appeal', entityId);
        const judgmentId = value(row, 'judgment_id');
        if (judgmentId) this.refreshOne(tx, 'judgment', judgmentId);
        return;
      }
      case 'judgment_file_link': {
        const row = this.anyRow(tx, 'judgment_file_link', entityId);
        for (const [type, id] of [
          ['judgment', value(row, 'judgment_id')],
          ['case_file', value(row, 'file_id')],
        ] as const) {
          if (id) this.refreshOne(tx, type, id);
        }
        return;
      }
      case 'task_status_history': {
        const row = this.anyRow(tx, 'task_status_history', entityId);
        const taskId = value(row, 'task_id');
        if (taskId) this.refreshOne(tx, 'task', taskId);
        return;
      }
      case 'court_circuit': {
        const row = this.anyRow(tx, 'court_circuit', entityId);
        const courtId = value(row, 'court_id');
        if (courtId) {
          this.refreshOne(tx, 'court', courtId);
          this.refreshCourtDependents(tx, courtId);
        }
        return;
      }
      default:
        return;
    }
  }

  private refreshDependents(tx: DatabaseAdapter, entityType: string, entityId: string): void {
    switch (entityType) {
      case 'party':
        this.refreshPartyDependents(tx, entityId);
        return;
      case 'case_file':
        this.refreshFileDependents(tx, entityId);
        return;
      case 'legal_case':
        this.refreshCaseDependents(tx, entityId);
        return;
      case 'court':
        this.refreshCourtDependents(tx, entityId);
        return;
      default:
        return;
    }
  }

  private refreshPartyDependents(tx: DatabaseAdapter, partyId: string): void {
    const files = tx.query<{ id: string }>(
      `SELECT file_id AS id FROM case_file_party WHERE party_id = ? AND deleted_at IS NULL
       UNION SELECT file_id AS id FROM task WHERE client_party_id = ? AND deleted_at IS NULL
       UNION SELECT file_id AS id FROM task WHERE assignee_party_id = ? AND deleted_at IS NULL
       UNION SELECT file_id AS id FROM case_file WHERE responsible_party_id = ? AND deleted_at IS NULL`,
      [partyId, partyId, partyId, partyId],
    );
    for (const file of files) this.refreshOne(tx, 'case_file', file.id);

    const cases = tx.query<{ id: string }>(
      `SELECT case_id AS id FROM case_file_party WHERE party_id = ? AND case_id IS NOT NULL AND deleted_at IS NULL`,
      [partyId],
    );
    for (const item of cases) this.refreshOne(tx, 'legal_case', item.id);

    const tasks = tx.query<{ id: string }>(
      `SELECT id FROM task WHERE (client_party_id = ? OR assignee_party_id = ?) AND deleted_at IS NULL`,
      [partyId, partyId],
    );
    for (const task of tasks) this.refreshOne(tx, 'task', task.id);

    const contracts = tx.query<{ contract_id: string }>(
      `SELECT contract_id FROM contract_party WHERE party_id = ? AND deleted_at IS NULL`,
      [partyId],
    );
    for (const contract of contracts) this.refreshOne(tx, 'contract', contract.contract_id);

    const documents = tx.query<{ id: string }>(
      `SELECT id FROM document WHERE source_party_id = ? AND deleted_at IS NULL`,
      [partyId],
    );
    for (const document of documents) this.refreshOne(tx, 'document', document.id);

    const interactions = tx.query<{ id: string }>(
      `SELECT id FROM party_interaction WHERE party_id = ? AND deleted_at IS NULL`,
      [partyId],
    );
    for (const interaction of interactions) this.refreshOne(tx, 'party_interaction', interaction.id);
  }

  private refreshFileDependents(tx: DatabaseAdapter, fileId: string): void {
    const cases = tx.query<{ case_id: string }>(
      'SELECT case_id FROM case_file_case WHERE file_id = ? AND deleted_at IS NULL',
      [fileId],
    );
    for (const item of cases) this.refreshOne(tx, 'legal_case', item.case_id);

    const notes = tx.query<{ id: string }>(
      'SELECT id FROM case_note WHERE file_id = ? AND deleted_at IS NULL',
      [fileId],
    );
    for (const note of notes) this.refreshOne(tx, 'case_note', note.id);

    const tasks = tx.query<{ id: string }>(
      'SELECT id FROM task WHERE file_id = ? AND deleted_at IS NULL',
      [fileId],
    );
    for (const task of tasks) this.refreshOne(tx, 'task', task.id);

    const documents = tx.query<{ document_id: string }>(
      'SELECT document_id FROM document_link WHERE file_id = ? AND deleted_at IS NULL',
      [fileId],
    );
    for (const document of documents) this.refreshOne(tx, 'document', document.document_id);
  }

  private refreshCaseDependents(tx: DatabaseAdapter, caseId: string): void {
    for (const table of ['hearing', 'judgment', 'case_note', 'task', 'appointment']) {
      const rows = tx.query<{ id: string }>(
        `SELECT id FROM "${table}" WHERE case_id = ? AND deleted_at IS NULL`,
        [caseId],
      );
      for (const row of rows) this.refreshOne(tx, table, row.id);
    }
  }

  private refreshCourtDependents(tx: DatabaseAdapter, courtId: string): void {
    const cases = tx.query<{ id: string }>(
      'SELECT id FROM legal_case WHERE court_id = ? AND deleted_at IS NULL',
      [courtId],
    );
    for (const item of cases) this.refreshOne(tx, 'legal_case', item.id);

    const hearings = tx.query<{ id: string }>(
      'SELECT id FROM hearing WHERE court_id = ? AND deleted_at IS NULL',
      [courtId],
    );
    for (const item of hearings) this.refreshOne(tx, 'hearing', item.id);

    const judgments = tx.query<{ id: string }>(
      'SELECT id FROM judgment WHERE court_id = ? AND deleted_at IS NULL',
      [courtId],
    );
    for (const item of judgments) this.refreshOne(tx, 'judgment', item.id);
  }

  private buildDocument(
    tx: DatabaseAdapter,
    entityType: string,
    entityId: string,
  ): DocumentParts | null {
    switch (entityType) {
      case 'party':
        return this.buildParty(tx, entityId);
      case 'case_file':
        return this.buildFile(tx, entityId);
      case 'legal_case':
        return this.buildCase(tx, entityId);
      case 'hearing':
        return this.buildHearing(tx, entityId);
      case 'judgment':
        return this.buildJudgment(tx, entityId);
      case 'task':
        return this.buildTask(tx, entityId);
      case 'document':
        return this.buildDocumentEntity(tx, entityId);
      case 'contract':
        return this.buildContract(tx, entityId);
      case 'power_of_attorney':
        return this.buildPoa(tx, entityId);
      case 'appointment':
        return this.buildAppointment(tx, entityId);
      case 'case_note':
        return this.buildCaseNote(tx, entityId);
      case 'court':
        return this.buildCourt(tx, entityId);
      case 'party_interaction':
        return this.buildInteraction(tx, entityId);
      default:
        return null;
    }
  }

  private buildParty(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT p.*, per.first_name, per.middle_name, per.last_name, per.national_id,
              per.occupation, org.legal_name, org.trade_name, cp.client_code,
              st.name_ar AS status_name
       FROM party p
       LEFT JOIN person per ON per.party_id = p.id
       LEFT JOIN organization org ON org.party_id = p.id
       LEFT JOIN client_profile cp ON cp.party_id = p.id AND cp.deleted_at IS NULL
       LEFT JOIN lookup_item st ON st.id = p.status_id
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;

    const contacts = tx.query<SqlRow>(
      `SELECT c.value, t.name_ar AS type_name
       FROM party_contact c LEFT JOIN lookup_item t ON t.id = c.contact_type_id
       WHERE c.party_id = ? AND c.deleted_at IS NULL`,
      [id],
    );
    const addresses = tx.query<SqlRow>(
      `SELECT a.city, a.district, a.street, g.name_ar AS governorate
       FROM party_address a LEFT JOIN lookup_item g ON g.id = a.governorate_id
       WHERE a.party_id = ? AND a.deleted_at IS NULL`,
      [id],
    );
    const aliases = tx.query<{ alias: string }>(
      'SELECT alias FROM party_alias WHERE party_id = ? AND deleted_at IS NULL',
      [id],
    );

    const fullName = joinNonEmpty(
      [value(row, 'first_name'), value(row, 'middle_name'), value(row, 'last_name')],
      ' ',
    );
    const title = String(row.display_name ?? fullName ?? 'طرف');
    const subtitleParts = [
      row.kind === 'person' ? 'شخص طبيعي' : 'شخص اعتباري',
      value(row, 'client_code') ? `موكل ${value(row, 'client_code')}` : null,
      value(row, 'status_name'),
    ].filter(Boolean);

    const body = buildSearchBody([
      title,
      fullName,
      value(row, 'legal_name'),
      value(row, 'trade_name'),
      value(row, 'national_id'),
      value(row, 'occupation'),
      value(row, 'notes'),
      ...contacts.map((c) => joinNonEmpty([value(c, 'type_name'), value(c, 'value')], ': ')),
      ...addresses.map((a) =>
        joinNonEmpty([value(a, 'governorate'), value(a, 'city'), value(a, 'district'), value(a, 'street')], ' '),
      ),
      ...aliases.map((a) => a.alias),
      subtitleParts.join(' '),
    ]);

    return { title, subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildFile(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT f.*, ft.name_ar AS file_type_name, pa.name_ar AS practice_area_name,
              st.name_ar AS status_name
       FROM case_file f
       LEFT JOIN lookup_item ft ON ft.id = f.file_type_id
       LEFT JOIN lookup_item pa ON pa.id = f.practice_area_id
       LEFT JOIN lookup_item st ON st.id = f.status_id
       WHERE f.id = ? AND f.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;

    const parties = tx.query<SqlRow>(
      `SELECT p.display_name, r.name_ar AS role_name, s.name_ar AS side_name
       FROM case_file_party cfp
       JOIN party p ON p.id = cfp.party_id
       LEFT JOIN lookup_item r ON r.id = cfp.role_id
       LEFT JOIN lookup_item s ON s.id = cfp.side_id
       WHERE cfp.file_id = ? AND cfp.deleted_at IS NULL
       ORDER BY cfp.ordinal`,
      [id],
    );
    const cases = tx.query<SqlRow>(
      `SELECT c.case_number, c.case_year, ct.name AS court_name
       FROM case_file_case cfc
       JOIN legal_case c ON c.id = cfc.case_id
       LEFT JOIN court ct ON ct.id = c.court_id
       WHERE cfc.file_id = ? AND cfc.deleted_at IS NULL`,
      [id],
    );
    const links = tx.query<SqlRow>(
      `SELECT f2.file_number, f2.title
       FROM case_file_link l JOIN case_file f2
         ON f2.id = CASE WHEN l.source_file_id = ? THEN l.target_file_id ELSE l.source_file_id END
       WHERE (l.source_file_id = ? OR l.target_file_id = ?) AND l.deleted_at IS NULL`,
      [id, id, id],
    );

    const title = `${row.file_number} — ${row.title}`;
    const subtitleParts = [
      value(row, 'file_type_name'),
      value(row, 'practice_area_name'),
      value(row, 'status_name'),
    ].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'file_number'),
      value(row, 'title'),
      value(row, 'description'),
      ...parties.map((p) => joinNonEmpty([value(p, 'display_name'), value(p, 'role_name'), value(p, 'side_name')], ' ')),
      ...cases.map((c) => joinNonEmpty([value(c, 'case_number'), value(c, 'case_year'), value(c, 'court_name')], ' ')),
      ...links.map((l) => joinNonEmpty([value(l, 'file_number'), value(l, 'title')], ' ')),
      subtitleParts.join(' '),
    ]);
    return { title, subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildCase(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT c.*, ct.name AS court_name, ci.name AS circuit_name,
              ty.name_ar AS type_name, dg.name_ar AS degree_name, st.name_ar AS status_name
       FROM legal_case c
       LEFT JOIN court ct ON ct.id = c.court_id
       LEFT JOIN court_circuit ci ON ci.id = c.circuit_id
       LEFT JOIN lookup_item ty ON ty.id = c.case_type_id
       LEFT JOIN lookup_item dg ON dg.id = c.litigation_degree_id
       LEFT JOIN lookup_item st ON st.id = c.status_id
       WHERE c.id = ? AND c.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;

    const files = tx.query<SqlRow>(
      `SELECT f.file_number, f.title FROM case_file_case cfc
       JOIN case_file f ON f.id = cfc.file_id
       WHERE cfc.case_id = ? AND cfc.deleted_at IS NULL`,
      [id],
    );
    const parties = tx.query<SqlRow>(
      `SELECT p.display_name, r.name_ar AS role_name
       FROM case_file_party cfp JOIN party p ON p.id = cfp.party_id
       LEFT JOIN lookup_item r ON r.id = cfp.role_id
       WHERE cfp.case_id = ? AND cfp.deleted_at IS NULL`,
      [id],
    );
    const links = tx.query<SqlRow>(
      `SELECT c2.case_number, c2.case_year FROM legal_case_link l
       JOIN legal_case c2 ON c2.id = CASE WHEN l.source_case_id = ? THEN l.target_case_id ELSE l.source_case_id END
       WHERE (l.source_case_id = ? OR l.target_case_id = ?) AND l.deleted_at IS NULL`,
      [id, id, id],
    );

    const title = `دعوى ${row.case_number}/${row.case_year}`;
    const subtitleParts = [value(row, 'court_name'), value(row, 'type_name'), value(row, 'status_name')].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'case_number'),
      value(row, 'case_year'),
      value(row, 'subject'),
      value(row, 'notes'),
      value(row, 'court_name'),
      value(row, 'circuit_name'),
      ...files.map((f) => joinNonEmpty([value(f, 'file_number'), value(f, 'title')], ' ')),
      ...parties.map((p) => joinNonEmpty([value(p, 'display_name'), value(p, 'role_name')], ' ')),
      ...links.map((l) => joinNonEmpty([value(l, 'case_number'), value(l, 'case_year')], '/')),
      subtitleParts.join(' '),
    ]);
    return { title, subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildHearing(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT h.*, c.case_number, c.case_year, ct.name AS court_name,
              ci.name AS circuit_name, st.name_ar AS status_name
       FROM hearing h
       JOIN legal_case c ON c.id = h.case_id
       LEFT JOIN court ct ON ct.id = h.court_id
       LEFT JOIN court_circuit ci ON ci.id = h.circuit_id
       LEFT JOIN lookup_item st ON st.id = h.status_id
       WHERE h.id = ? AND h.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    const title = `جلسة ${row.case_number}/${row.case_year} — ${row.scheduled_at}`;
    const subtitleParts = [value(row, 'court_name'), value(row, 'status_name')].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'case_number'),
      value(row, 'case_year'),
      value(row, 'scheduled_at'),
      value(row, 'purpose'),
      value(row, 'outcome_summary'),
      value(row, 'court_decision'),
      value(row, 'postponement_reason'),
      value(row, 'required_actions'),
      value(row, 'notes'),
      value(row, 'court_name'),
      value(row, 'circuit_name'),
    ]);
    return { title, subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildJudgment(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT j.*, c.case_number, c.case_year, ct.name AS court_name,
              ty.name_ar AS type_name, st.name_ar AS status_name
       FROM judgment j
       JOIN legal_case c ON c.id = j.case_id
       LEFT JOIN court ct ON ct.id = j.court_id
       LEFT JOIN lookup_item ty ON ty.id = j.judgment_type_id
       LEFT JOIN lookup_item st ON st.id = j.status_id
       WHERE j.id = ? AND j.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    const appeals = tx.query<SqlRow>(
      `SELECT a.*, t.name_ar AS appeal_type FROM judgment_appeal a
       LEFT JOIN lookup_item t ON t.id = a.appeal_type_id
       WHERE a.judgment_id = ? AND a.deleted_at IS NULL`,
      [id],
    );
    const files = tx.query<SqlRow>(
      `SELECT f.file_number FROM judgment_file_link l JOIN case_file f ON f.id = l.file_id
       WHERE l.judgment_id = ? AND l.deleted_at IS NULL`,
      [id],
    );
    const title = `حكم ${value(row, 'judgment_number') ?? ''} — ${row.case_number}/${row.case_year}`.trim();
    const subtitleParts = [value(row, 'court_name'), value(row, 'type_name'), value(row, 'status_name')].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'judgment_number'),
      value(row, 'operative_part'),
      value(row, 'reasoning'),
      value(row, 'notes'),
      value(row, 'appeal_notes'),
      value(row, 'issued_on'),
      value(row, 'case_number'),
      value(row, 'case_year'),
      ...appeals.map((a) =>
        joinNonEmpty([value(a, 'appeal_type'), value(a, 'filed_on'), value(a, 'notes')], ' '),
      ),
      ...files.map((f) => value(f, 'file_number')),
    ]);
    return { title, subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildTask(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT t.*, ty.name_ar AS type_name, st.name_ar AS status_name,
              pr.name_ar AS priority_name, p.display_name AS assignee_name,
              f.file_number, c.case_number, c.case_year
       FROM task t
       LEFT JOIN lookup_item ty ON ty.id = t.task_type_id
       LEFT JOIN lookup_item st ON st.id = t.status_id
       LEFT JOIN lookup_item pr ON pr.id = t.priority_id
       LEFT JOIN party p ON p.id = t.assignee_party_id
       LEFT JOIN case_file f ON f.id = t.file_id
       LEFT JOIN legal_case c ON c.id = t.case_id
       WHERE t.id = ? AND t.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    const subtitleParts = [
      value(row, 'type_name'),
      value(row, 'status_name'),
      value(row, 'assignee_name'),
      value(row, 'due_at'),
    ].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'title'),
      value(row, 'description'),
      value(row, 'result_summary'),
      value(row, 'notes'),
      value(row, 'assignee_name'),
      value(row, 'file_number'),
      value(row, 'case_number'),
      subtitleParts.join(' '),
    ]);
    return { title: String(row.title), subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildDocumentEntity(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT d.*, ty.name_ar AS type_name, st.name_ar AS status_name,
              p.display_name AS source_name
       FROM document d
       LEFT JOIN lookup_item ty ON ty.id = d.doc_type_id
       LEFT JOIN lookup_item st ON st.id = d.status_id
       LEFT JOIN party p ON p.id = d.source_party_id
       WHERE d.id = ? AND d.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    const versions = tx.query<SqlRow>(
      `SELECT file_name, storage_kind, storage_state FROM document_version
       WHERE document_id = ? AND deleted_at IS NULL ORDER BY version_no`,
      [id],
    );
    const links = tx.query<SqlRow>(
      `SELECT dl.*, f.file_number, c.case_number, ct.contract_number, poa.poa_number,
              p.display_name AS party_name, t.title AS task_title
       FROM document_link dl
       LEFT JOIN case_file f ON f.id = dl.file_id
       LEFT JOIN legal_case c ON c.id = dl.case_id
       LEFT JOIN contract ct ON ct.id = dl.contract_id
       LEFT JOIN power_of_attorney poa ON poa.id = dl.power_of_attorney_id
       LEFT JOIN party p ON p.id = dl.party_id
       LEFT JOIN task t ON t.id = dl.task_id
       WHERE dl.document_id = ? AND dl.deleted_at IS NULL`,
      [id],
    );
    const subtitleParts = [value(row, 'type_name'), value(row, 'doc_number'), value(row, 'status_name')].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'title'),
      value(row, 'doc_number'),
      value(row, 'notes'),
      value(row, 'physical_location'),
      value(row, 'external_ref'),
      value(row, 'source_name'),
      ...versions.map((v) => joinNonEmpty([value(v, 'file_name'), value(v, 'storage_kind')], ' ')),
      ...links.map((l) =>
        joinNonEmpty([
          value(l, 'file_number'),
          value(l, 'case_number'),
          value(l, 'contract_number'),
          value(l, 'poa_number'),
          value(l, 'party_name'),
          value(l, 'task_title'),
        ], ' '),
      ),
      subtitleParts.join(' '),
    ]);
    return { title: String(row.title), subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildContract(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT c.*, ty.name_ar AS type_name, st.name_ar AS status_name, f.file_number
       FROM contract c
       LEFT JOIN lookup_item ty ON ty.id = c.contract_type_id
       LEFT JOIN lookup_item st ON st.id = c.status_id
       LEFT JOIN case_file f ON f.id = c.file_id
       WHERE c.id = ? AND c.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    const parties = tx.query<SqlRow>(
      `SELECT p.display_name, r.name_ar AS role_name
       FROM contract_party cp JOIN party p ON p.id = cp.party_id
       LEFT JOIN lookup_item r ON r.id = cp.role_id
       WHERE cp.contract_id = ? AND cp.deleted_at IS NULL`,
      [id],
    );
    const subtitleParts = [value(row, 'type_name'), value(row, 'status_name')].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'contract_number'),
      value(row, 'title'),
      value(row, 'terms_summary'),
      value(row, 'notes'),
      value(row, 'file_number'),
      ...parties.map((p) => joinNonEmpty([value(p, 'display_name'), value(p, 'role_name')], ' ')),
      subtitleParts.join(' '),
    ]);
    return { title: String(row.title), subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildPoa(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT p.*, k.name_ar AS kind_name, st.name_ar AS status_name,
              pr.display_name AS principal_name, ag.display_name AS agent_name,
              f.file_number
       FROM power_of_attorney p
       LEFT JOIN lookup_item k ON k.id = p.instrument_kind_id
       LEFT JOIN lookup_item st ON st.id = p.status_id
       JOIN party pr ON pr.id = p.principal_party_id
       JOIN party ag ON ag.id = p.agent_party_id
       LEFT JOIN case_file f ON f.id = p.file_id
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    const subtitleParts = [value(row, 'kind_name'), value(row, 'poa_number'), value(row, 'status_name')].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'poa_number'),
      value(row, 'scope_text'),
      value(row, 'notary_office'),
      value(row, 'notes'),
      value(row, 'principal_name'),
      value(row, 'agent_name'),
      value(row, 'file_number'),
      subtitleParts.join(' '),
    ]);
    return {
      title: `توكيل ${value(row, 'poa_number') ?? ''}`.trim(),
      subtitle: subtitleParts.join(' · ') || null,
      body,
    };
  }

  private buildAppointment(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT a.*, k.name_ar AS kind_name, st.name_ar AS status_name,
              p.display_name AS party_name, f.file_number
       FROM appointment a
       LEFT JOIN lookup_item k ON k.id = a.kind_id
       LEFT JOIN lookup_item st ON st.id = a.status_id
       LEFT JOIN party p ON p.id = a.party_id
       LEFT JOIN case_file f ON f.id = a.file_id
       WHERE a.id = ? AND a.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    const subtitleParts = [value(row, 'kind_name'), value(row, 'start_at'), value(row, 'party_name')].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'title'),
      value(row, 'location'),
      value(row, 'notes'),
      value(row, 'party_name'),
      value(row, 'file_number'),
      subtitleParts.join(' '),
    ]);
    return { title: String(row.title), subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildCaseNote(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT n.*, f.file_number, f.title AS file_title
       FROM case_note n JOIN case_file f ON f.id = n.file_id
       WHERE n.id = ? AND n.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    return {
      title: `ملاحظة — ${row.file_number}`,
      subtitle: value(row, 'file_title'),
      body: buildSearchBody([value(row, 'body'), value(row, 'file_number'), value(row, 'file_title')]),
    };
  }

  private buildCourt(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT c.*, k.name_ar AS kind_name, g.name_ar AS governorate_name
       FROM court c
       LEFT JOIN lookup_item k ON k.id = c.court_kind_id
       LEFT JOIN lookup_item g ON g.id = c.governorate_id
       WHERE c.id = ? AND c.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    const circuits = tx.query<{ name: string }>(
      'SELECT name FROM court_circuit WHERE court_id = ? AND deleted_at IS NULL',
      [id],
    );
    const subtitleParts = [value(row, 'kind_name'), value(row, 'governorate_name')].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'name'),
      value(row, 'address'),
      value(row, 'notes'),
      ...circuits.map((c) => c.name),
      subtitleParts.join(' '),
    ]);
    return { title: String(row.name), subtitle: subtitleParts.join(' · ') || null, body };
  }

  private buildInteraction(tx: DatabaseAdapter, id: string): DocumentParts | null {
    const row = tx.get<SqlRow>(
      `SELECT i.*, p.display_name, ch.name_ar AS channel_name
       FROM party_interaction i
       JOIN party p ON p.id = i.party_id
       LEFT JOIN lookup_item ch ON ch.id = i.channel_id
       WHERE i.id = ? AND i.deleted_at IS NULL`,
      [id],
    );
    if (!row) return null;
    const subtitleParts = [value(row, 'display_name'), value(row, 'channel_name'), value(row, 'occurred_at')].filter(Boolean);
    const body = buildSearchBody([
      value(row, 'summary'),
      value(row, 'details'),
      value(row, 'display_name'),
      value(row, 'channel_name'),
    ]);
    return { title: String(row.summary), subtitle: subtitleParts.join(' · ') || null, body };
  }

  private upsertDocument(
    tx: DatabaseAdapter,
    entityType: string,
    entityId: string,
    parts: DocumentParts,
  ): void {
    const normalized = normalizeArabic(parts.body);
    const updatedAt = toCanonicalTimestamp(this.clock.now());
    const existing = tx.get<{ id: number }>(
      'SELECT id FROM search_document WHERE entity_type = ? AND entity_id = ?',
      [entityType, entityId],
    );
    if (existing) {
      tx.run(
        `UPDATE search_document
         SET title = ?, subtitle = ?, body = ?, normalized_text = ?, updated_at = ?
         WHERE id = ?`,
        [parts.title, parts.subtitle, parts.body, normalized, updatedAt, existing.id],
      );
    } else {
      tx.run(
        `INSERT INTO search_document
          (entity_type, entity_id, title, subtitle, body, normalized_text, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [entityType, entityId, parts.title, parts.subtitle, parts.body, normalized, updatedAt],
      );
    }
  }

  private deleteDocument(tx: DatabaseAdapter, entityType: string, entityId: string): void {
    tx.run('DELETE FROM search_document WHERE entity_type = ? AND entity_id = ?', [
      entityType,
      entityId,
    ]);
  }

  private anyRow(tx: DatabaseAdapter, table: string | undefined, id: string): SqlRow | undefined {
    if (!table) return undefined;
    return tx.get<SqlRow>(`SELECT * FROM "${table}" WHERE id = ?`, [id]);
  }

  private hasFtsTable(): boolean {
    return this.db.get("SELECT name FROM sqlite_master WHERE name = 'search_fts'") !== undefined;
  }

  private readMeta(key: string): string | undefined {
    return this.db.get<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [key])?.value;
  }

  private setMeta(key: string, value: string): void {
    this.db.run(
      `INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, toCanonicalTimestamp(this.clock.now())],
    );
  }
}

function tableForType(entityType: string): string | undefined {
  const map: Record<string, string> = {
    party: 'party',
    case_file: 'case_file',
    legal_case: 'legal_case',
    hearing: 'hearing',
    judgment: 'judgment',
    task: 'task',
    document: 'document',
    contract: 'contract',
    power_of_attorney: 'power_of_attorney',
    appointment: 'appointment',
    case_note: 'case_note',
    court: 'court',
    party_interaction: 'party_interaction',
    person: 'person',
    organization: 'organization',
    client_profile: 'client_profile',
    party_contact: 'party_contact',
    party_address: 'party_address',
    party_alias: 'party_alias',
    party_relationship: 'party_relationship',
    case_file_party: 'case_file_party',
    case_file_case: 'case_file_case',
    case_file_link: 'case_file_link',
    legal_case_link: 'legal_case_link',
    document_version: 'document_version',
    document_link: 'document_link',
    contract_party: 'contract_party',
    judgment_appeal: 'judgment_appeal',
    judgment_file_link: 'judgment_file_link',
    task_status_history: 'task_status_history',
    court_circuit: 'court_circuit',
  };
  return map[entityType];
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function makeSnippet(body: string, token: string): string {
  const normalized = normalizeArabic(body);
  const index = normalized.indexOf(token);
  if (index === -1) return body.slice(0, 180);
  const start = Math.max(0, index - 60);
  const end = Math.min(normalized.length, index + token.length + 120);
  return normalized.slice(start, end).trim();
}
