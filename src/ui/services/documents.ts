import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';

export interface DocumentRow {
  document: EngineRow;
  typeName: string;
  contentStateName: string;
  versionsCount: number;
  links: string[];
}

export interface DocumentDetail {
  document: EngineRow;
  versions: EngineRow[];
  links: Array<{ link: EngineRow; kind: string; label: string; targetId: string }>;
  activity: EngineRow[];
}

export class DocumentService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async list(request: TableRequest): Promise<TableResult<DocumentRow>> {
    const { db, lookups } = this.deps;
    const typeId = request.filters.type ? lookups.id('document_type', request.filters.type) : null;
    let rows: EngineRow[];
    let total: number;
    if (request.search.trim()) {
      const hits: string[] = [];
      let offset = 0;
      for (;;) {
        const page = await db.searchPage(request.search.trim(), { entityType: 'document', limit: 200, offset });
        hits.push(...page.hits.map((hit) => hit.entityId));
        offset += page.hits.length;
        if (page.hits.length === 0 || offset >= page.total) break;
      }
      const docs: EngineRow[] = [];
      for (const id of hits) {
        const doc = await db.get('document', id);
        if (!doc) continue;
        if (typeId && String(doc.doc_type_id ?? '') !== typeId) continue;
        docs.push(doc);
      }
      docs.sort((a, b) => compareDocs(a, b, request.sortKey, request.sortDir));
      total = docs.length;
      const { offset: pageOffset, limit } = paginate(request.page, request.pageSize);
      rows = docs.slice(pageOffset, pageOffset + limit);
    } else {
      const page = await db.query('document', {
        filters: typeId ? [{ column: 'doc_type_id', op: 'eq', value: typeId }] : [],
        orderBy: [{ column: request.sortKey === 'title' ? 'title' : 'doc_date', direction: request.sortDir ?? 'desc' }],
        ...paginate(request.page, request.pageSize),
      });
      rows = page.rows;
      total = page.total;
    }
    const enriched: DocumentRow[] = [];
    for (const document of rows) {
      const versions = await db.query('document_version', {
        filters: [{ column: 'document_id', op: 'eq', value: String(document.id) }],
        limit: 0,
      });
      const links = await db.query('document_link', {
        filters: [{ column: 'document_id', op: 'eq', value: String(document.id) }],
        limit: 20,
      });
      enriched.push({
        document,
        typeName: lookups.byId(String(document.doc_type_id ?? ''))?.nameAr ?? '—',
        contentStateName: lookups.byId(String(document.content_state ?? ''))?.nameAr ?? humanContentState(String(document.content_state ?? '')),
        versionsCount: versions.total,
        links: links.rows.map((link) => linkLabel(link)),
      });
    }
    return { rows: enriched, total };
  }

  async get(documentId: string): Promise<DocumentDetail | null> {
    const { db } = this.deps;
    const document = await db.get('document', documentId);
    if (!document) return null;
    const versions = (await db.query('document_version', {
      filters: [{ column: 'document_id', op: 'eq', value: documentId }],
      orderBy: [{ column: 'version_no', direction: 'desc' }],
      limit: 100,
    })).rows;
    const linkRows = (await db.query('document_link', {
      filters: [{ column: 'document_id', op: 'eq', value: documentId }],
      limit: 50,
    })).rows;
    const links: DocumentDetail['links'] = [];
    for (const link of linkRows) {
      const resolved = await this.resolveLink(link);
      if (resolved) links.push({ link, ...resolved });
    }
    const activity = await db.auditTrail('document', documentId, 40);
    return { document, versions, links, activity };
  }

  private async resolveLink(link: EngineRow): Promise<{ kind: string; label: string; targetId: string } | null> {
    const { db } = this.deps;
    if (link.file_id) {
      const file = await db.get('case_file', String(link.file_id));
      return file ? { kind: 'ملف', label: `${file.file_number} — ${file.title}`, targetId: String(file.id) } : null;
    }
    if (link.case_id) {
      const legalCase = await db.get('legal_case', String(link.case_id));
      return legalCase ? { kind: 'قضية', label: `قضية ${legalCase.case_number} / ${legalCase.case_year}`, targetId: String(legalCase.id) } : null;
    }
    if (link.hearing_id) {
      const hearing = await db.get('hearing', String(link.hearing_id));
      return hearing ? { kind: 'جلسة', label: `جلسة ${String(hearing.scheduled_at).slice(0, 10)}`, targetId: String(hearing.id) } : null;
    }
    if (link.judgment_id) {
      const judgment = await db.get('judgment', String(link.judgment_id));
      return judgment ? { kind: 'حكم', label: `حكم ${judgment.judgment_number ?? ''}`, targetId: String(judgment.id) } : null;
    }
    if (link.contract_id) {
      const contract = await db.get('contract', String(link.contract_id));
      return contract ? { kind: 'عقد', label: String(contract.title), targetId: String(contract.id) } : null;
    }
    if (link.power_of_attorney_id) {
      const poa = await db.get('power_of_attorney', String(link.power_of_attorney_id));
      return poa ? { kind: 'توكيل', label: String(poa.poa_number ?? ''), targetId: String(poa.id) } : null;
    }
    if (link.party_id) {
      const party = await db.get('party', String(link.party_id));
      return party ? { kind: 'طرف', label: String(party.display_name), targetId: String(party.id) } : null;
    }
    if (link.task_id) {
      const task = await db.get('task', String(link.task_id));
      return task ? { kind: 'تكليف', label: String(task.title), targetId: String(task.id) } : null;
    }
    return null;
  }

  async create(input: {
    title: string;
    docTypeCode?: string;
    docNumber?: string;
    docDate?: string;
    fileId?: string;
    caseId?: string;
    notes?: string;
    confidentialityCode?: string;
    externalRef?: string;
  }): Promise<EngineRow> {
    if (!input.title.trim()) throw new ValidationError('document title is required');
    const document = await this.deps.db.registerDocument({
      title: input.title,
      ...(input.docTypeCode ? { docTypeCode: input.docTypeCode } : {}),
      ...(input.docNumber ? { docNumber: input.docNumber } : {}),
      ...(input.docDate ? { docDate: input.docDate } : {}),
      ...(input.fileId ? { fileId: input.fileId } : {}),
      ...(input.caseId ? { caseId: input.caseId } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    });
    const patch: Record<string, unknown> = {};
    if (input.confidentialityCode) patch.confidentiality_id = this.deps.lookups.id('confidentiality', input.confidentialityCode);
    if (input.externalRef) patch.external_ref = input.externalRef;
    if (Object.keys(patch).length > 0) await this.deps.db.update('document', String(document.id), patch);
    this.deps.cache.invalidate();
    return (await this.deps.db.get('document', String(document.id))) ?? document;
  }

  async addVersion(documentId: string, input: {
    fileName?: string;
    storageKind: 'local_file' | 'external_reference' | 'paper';
    storagePath?: string;
    notes?: string;
    mimeType?: string;
    byteSize?: number;
  }): Promise<EngineRow> {
    const version = await this.deps.db.addDocumentVersion(documentId, {
      storageKind: input.storageKind,
      ...(input.fileName ? { fileName: input.fileName } : {}),
      ...(input.storagePath ? { storagePath: input.storagePath } : {}),
      ...(input.byteSize ? { byteSize: input.byteSize } : {}),
    });
    if (input.notes || input.mimeType) {
      await this.deps.db.update('document_version', String(version.id), {
        ...(input.notes ? { notes: input.notes } : {}),
        ...(input.mimeType ? { mime_type: input.mimeType } : {}),
      });
    }
    return version;
  }

  async link(documentId: string, kind: 'file' | 'case' | 'hearing' | 'judgment' | 'contract' | 'poa' | 'party' | 'task', id: string): Promise<void> {
    await this.deps.db.linkDocument(documentId, { kind, id });
  }

  async update(documentId: string, patch: Record<string, unknown>): Promise<void> {
    await this.deps.db.update('document', documentId, patch);
    this.deps.cache.invalidate('document', documentId);
  }

  async remove(documentId: string): Promise<void> {
    await this.deps.db.softDelete('document', documentId, 'حذف مستند');
    this.deps.cache.invalidate();
  }
}

function linkLabel(link: EngineRow): string {
  if (link.file_id) return 'ملف';
  if (link.case_id) return 'قضية';
  if (link.hearing_id) return 'جلسة';
  if (link.judgment_id) return 'حكم';
  if (link.contract_id) return 'عقد';
  if (link.power_of_attorney_id) return 'توكيل';
  if (link.party_id) return 'طرف';
  if (link.task_id) return 'تكليف';
  return 'مرتبط';
}

function compareDocs(a: EngineRow, b: EngineRow, sortKey: string | undefined, dir: 'asc' | 'desc' | undefined): number {
  const column = sortKey === 'title' ? 'title' : 'doc_date';
  return String(a[column] ?? '').localeCompare(String(b[column] ?? ''), 'ar') * (dir === 'asc' ? 1 : -1);
}

function humanContentState(code: string): string {
  switch (code) {
    case 'not_digitized':
      return 'ورقي غير رقمي';
    case 'referenced':
      return 'مرجع خارجي';
    case 'pending':
      return 'بانتظار الحفظ';
    case 'stored':
      return 'محفوظ';
    case 'failed':
      return 'فشل الحفظ';
    default:
      return code || '—';
  }
}
