import type { SqlRow } from '../db/adapter.ts';
import { NotFoundError, ValidationError } from '../errors.ts';
import { getSyncEntity } from '../sync/entity-registry.ts';
import { assertIsoDate } from '../util/dates.ts';
import { BaseRepository, type EntityRecord, type RepositoryDependencies } from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';

export interface DocumentRecord extends EntityRecord {
  readonly title: string;
  readonly doc_type_id: string | null;
  readonly doc_number: string | null;
  readonly doc_date: string | null;
  readonly source_party_id: string | null;
  readonly content_state: string;
  readonly physical_location: string | null;
  readonly external_ref: string | null;
  readonly confidentiality_id: string | null;
  readonly status_id: string | null;
  readonly notes: string | null;
  readonly archived_at: string | null;
}

export interface DocumentVersionRecord extends EntityRecord {
  readonly document_id: string;
  readonly version_no: number;
  readonly file_name: string | null;
  readonly storage_kind: 'local_file' | 'external_reference' | 'paper';
  readonly storage_path: string | null;
  readonly mime_type: string | null;
  readonly byte_size: number | null;
  readonly checksum_sha256: string | null;
  readonly storage_state: 'registered' | 'stored' | 'verified' | 'missing' | 'failed';
  readonly verified_at: string | null;
  readonly notes: string | null;
}

export type DocumentTarget =
  | { kind: 'file'; id: string }
  | { kind: 'case'; id: string }
  | { kind: 'hearing'; id: string }
  | { kind: 'judgment'; id: string }
  | { kind: 'contract'; id: string }
  | { kind: 'poa'; id: string }
  | { kind: 'party'; id: string }
  | { kind: 'task'; id: string };

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * A document row describes metadata. A version row describes a physical or
 * digital carrier. Registering a version NEVER means the bytes were saved:
 * that requires `markStored` after the storage layer confirms success.
 */
export class DocumentRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly documents: BaseRepository<DocumentRecord>;
  private readonly versions: BaseRepository<DocumentVersionRecord>;
  private readonly links: BaseRepository<EntityRecord>;

  constructor(deps: RepositoryDependencies, lookups: LookupRepository) {
    this.deps = deps;
    this.lookups = lookups;
    this.documents = new BaseRepository<DocumentRecord>(deps, getSyncEntity('document'));
    this.versions = new BaseRepository<DocumentVersionRecord>(deps, getSyncEntity('document_version'));
    this.links = new BaseRepository(deps, getSyncEntity('document_link'));
  }

  register(input: {
    title: string;
    docTypeCode?: string;
    docNumber?: string;
    docDate?: string;
    sourcePartyId?: string;
    contentState?: 'not_digitized' | 'referenced' | 'pending';
    physicalLocation?: string;
    externalRef?: string;
    confidentialityCode?: string;
    statusCode?: string;
    notes?: string;
  }): DocumentRecord {
    if (!input.title?.trim()) throw new ValidationError('document title is required');
    if (input.docDate) assertIsoDate(input.docDate, 'docDate');
    if (input.sourcePartyId) this.requireExisting('party', input.sourcePartyId);
    if (input.contentState && !['not_digitized', 'referenced', 'pending'].includes(input.contentState)) {
      throw new ValidationError('new documents may not claim stored content without a version');
    }
    return this.documents.insert({
      title: input.title.trim(),
      doc_type_id: this.lookups.resolveOptional('document_type', input.docTypeCode),
      doc_number: input.docNumber?.trim() || null,
      doc_date: input.docDate ?? null,
      source_party_id: input.sourcePartyId ?? null,
      content_state: input.contentState ?? 'not_digitized',
      physical_location: input.physicalLocation ?? null,
      external_ref: input.externalRef ?? null,
      confidentiality_id: this.lookups.resolveOptional('confidentiality', input.confidentialityCode),
      status_id: this.lookups.resolveOptional('document_status', input.statusCode ?? 'draft'),
      notes: input.notes ?? null,
      archived_at: null,
    });
  }

  addVersion(
    documentId: string,
    input: {
      fileName?: string;
      storageKind: 'local_file' | 'external_reference' | 'paper';
      storagePath?: string;
      mimeType?: string;
      byteSize?: number;
      checksumSha256?: string;
      notes?: string;
    },
  ): DocumentVersionRecord {
    const document = this.documents.requireById(documentId);
    if (input.storageKind === 'local_file' && !input.fileName?.trim()) {
      throw new ValidationError('fileName is required for a local file version');
    }
    if (input.checksumSha256 && !SHA256_RE.test(input.checksumSha256)) {
      throw new ValidationError('checksum must be a lowercase SHA-256 hex digest');
    }
    if (input.byteSize !== undefined && (!Number.isSafeInteger(input.byteSize) || input.byteSize < 0)) {
      throw new ValidationError('byteSize must be a non-negative integer');
    }
    const nextVersion =
      (this.deps.db.get<{ m: number }>(
        'SELECT COALESCE(MAX(version_no), 0) AS m FROM document_version WHERE document_id = ?',
        [documentId],
      )?.m ?? 0) + 1;

    return this.deps.db.transaction(() => {
      const version = this.versions.insert({
        document_id: documentId,
        version_no: nextVersion,
        file_name: input.fileName?.trim() || null,
        storage_kind: input.storageKind,
        storage_path: input.storagePath ?? null,
        mime_type: input.mimeType ?? null,
        byte_size: input.byteSize ?? null,
        checksum_sha256: input.checksumSha256 ?? null,
        storage_state: 'registered',
        verified_at: null,
        notes: input.notes ?? null,
      });
      if (document.content_state !== 'pending' && input.storageKind === 'local_file') {
        this.documents.update(documentId, { content_state: 'pending' });
      }
      return version;
    });
  }

  /** Call only after the file storage layer confirms the bytes were written. */
  markStored(
    versionId: string,
    input: {
      storagePath: string;
      checksumSha256?: string;
      byteSize?: number;
      mimeType?: string;
    },
  ): DocumentVersionRecord {
    const version = this.versions.requireById(versionId);
    if (version.storage_kind !== 'local_file') {
      throw new ValidationError('only local_file versions can be marked stored');
    }
    if (!input.storagePath?.trim()) throw new ValidationError('storagePath is required');
    if (input.checksumSha256 && !SHA256_RE.test(input.checksumSha256)) {
      throw new ValidationError('checksum must be a lowercase SHA-256 hex digest');
    }
    return this.deps.db.transaction(() => {
      const updated = this.versions.update(versionId, {
        storage_path: input.storagePath.trim(),
        ...(input.checksumSha256 ? { checksum_sha256: input.checksumSha256 } : {}),
        ...(input.byteSize !== undefined ? { byte_size: input.byteSize } : {}),
        ...(input.mimeType ? { mime_type: input.mimeType } : {}),
        storage_state: 'stored',
      });
      this.documents.update(version.document_id, { content_state: 'stored' });
      return updated;
    });
  }

  /** Verification requires the checksum computed by the caller from the file. */
  verifyVersion(versionId: string, actualSha256: string, verifiedAtIso: string): DocumentVersionRecord {
    if (!SHA256_RE.test(actualSha256)) {
      throw new ValidationError('actual checksum must be a lowercase SHA-256 hex digest');
    }
    const version = this.versions.requireById(versionId);
    if (!version.checksum_sha256) {
      throw new ValidationError('version has no stored checksum to verify against');
    }
    if (version.checksum_sha256 !== actualSha256) {
      throw new ValidationError('checksum mismatch; the stored file is not the registered one', {
        versionId,
      });
    }
    return this.versions.update(versionId, {
      storage_state: 'verified',
      verified_at: verifiedAtIso,
    });
  }

  link(documentId: string, target: DocumentTarget, notes?: string): EntityRecord {
    this.documents.requireById(documentId);
    this.requireTarget(target);
    const values: Record<string, string | null> = {
      document_id: documentId,
      file_id: null,
      case_id: null,
      hearing_id: null,
      judgment_id: null,
      contract_id: null,
      power_of_attorney_id: null,
      party_id: null,
      task_id: null,
      notes: notes ?? null,
    };
    const column =
      target.kind === 'poa'
        ? 'power_of_attorney_id'
        : `${target.kind}_id`;
    values[column] = target.id;
    return this.links.insert(values);
  }

  getDocument(id: string): DocumentRecord {
    return this.documents.requireById(id);
  }

  getFull(id: string): {
    document: DocumentRecord;
    versions: readonly DocumentVersionRecord[];
    links: ReadonlyArray<SqlRow>;
  } {
    const document = this.documents.requireById(id);
    const versions = this.versions.list({
      filters: [{ column: 'document_id', value: id }],
      limit: 200,
      orderBy: { column: 'version_no', direction: 'asc' },
    });
    const links = this.deps.db.query<SqlRow>(
      `SELECT dl.*, f.file_number, c.case_number, ct.contract_number, p.poa_number,
              pa.display_name
       FROM document_link dl
       LEFT JOIN case_file f ON f.id = dl.file_id
       LEFT JOIN legal_case c ON c.id = dl.case_id
       LEFT JOIN contract ct ON ct.id = dl.contract_id
       LEFT JOIN power_of_attorney p ON p.id = dl.power_of_attorney_id
       LEFT JOIN party pa ON pa.id = dl.party_id
       WHERE dl.document_id = ? AND dl.deleted_at IS NULL`,
      [id],
    );
    return { document, versions, links };
  }

  listDocuments(
    options: { docTypeCode?: string; limit?: number; offset?: number } = {},
  ): DocumentRecord[] {
    const filters = [];
    if (options.docTypeCode) {
      filters.push({
        column: 'doc_type_id',
        value: this.lookups.requireItemByCode('document_type', options.docTypeCode).id,
      });
    }
    return this.documents.list({
      filters,
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      orderBy: { column: 'created_at', direction: 'desc' },
    });
  }

  archive(id: string): DocumentRecord {
    return this.documents.archive(id);
  }

  softDelete(id: string, reason?: string): { batchId: string; affectedCount: number } {
    return this.documents.softDelete(id, { ...(reason === undefined ? {} : { reason }) });
  }

  restore(id: string): { batchId: string | null; restoredCount: number } {
    return this.documents.restore(id);
  }

  private requireTarget(target: DocumentTarget): void {
    const table: Record<DocumentTarget['kind'], string> = {
      file: 'case_file',
      case: 'legal_case',
      hearing: 'hearing',
      judgment: 'judgment',
      contract: 'contract',
      poa: 'power_of_attorney',
      party: 'party',
      task: 'task',
    };
    this.requireExisting(table[target.kind], target.id);
  }

  private requireExisting(table: string, id: string): void {
    const row = this.deps.db.get(`SELECT id FROM "${table}" WHERE id = ? AND deleted_at IS NULL`, [
      id,
    ]);
    if (!row) throw new NotFoundError(table, id);
  }
}
