/** Disposable, deterministic bulk fixtures. Never imported by the app or applied to an office database. */
import type { PortableLawOffice } from '../src/portable/portable-database.ts';
import type { PortableStore, EngineRow } from '../src/portable/store.ts';
import { Lookups } from '../src/ui/state/lookups.ts';
import { RecordCache } from '../src/ui/services/types.ts';
import { CaseService } from '../src/ui/services/cases.ts';
import { normalizeArabic } from '../src/util/arabic.ts';
const uuid = (tag: number, i: number) =>
  `b${tag}000000-0000-4000-8000-${i.toString(16).padStart(12, '0')}`;
export async function prepareCaseBenchmark(
  db: PortableLawOffice,
  store: PortableStore,
  count: number,
  progress: (s: string) => void,
) {
  const lookups = await Lookups.load(db),
    cache = new RecordCache(db),
    cases = new CaseService({ db, lookups, cache });
  const person = (await db.createPerson({
    firstName: 'موكل',
    lastName: 'اصطناعي للأداء',
  })) as { party: EngineRow };
  const court = await db.createCourt({ name: 'جهة اصطناعية لاختبار الأداء' });
  const base = await cases.saveIntake({
    title: 'ملف أساس اصطناعي للأداء',
    caseTypeCode: 'civil',
    caseNumber: 'BENCH-BASE',
    caseYear: 2026,
    courtId: String(court.id),
    parties: [
      {
        partyId: String(person.party.id),
        roleCode: 'plaintiff',
        isClient: true,
      },
    ],
  });
  const term = await cases.addTerm({
    name: 'موضوع اصطناعي للأداء',
    aliases: ['قياس البحث المحلي'],
  });
  const stage = await cases.saveStage({
    fileId: String(base.file.id),
    caseId: String(base.legalCase!.id),
    typeCode: 'notice',
    startedOn: '2026-09-01',
    statusCode: 'ended',
    completedOn: '2026-09-02',
    authorityId: String(court.id),
    referenceNumber: 'BENCH-NOTICE',
  });
  const fileProto = await db.require('case_file', String(base.file.id)),
    caseProto = await db.require('legal_case', String(base.legalCase!.id));
  const linkProto = (await db.query('case_file_case', { limit: 1 })).rows[0]!,
    partyProto = (await db.query('case_file_party', { limit: 1 })).rows[0]!;
  const docs = await store.getByColumns('search_document', {
      entity_type: 'legal_case',
      entity_id: String(base.legalCase!.id),
    }),
    docProto = docs[0]!;
  const typeIds = ['civil', 'labor', 'family'].map(
    (c) => lookups.id('case_type', c)!,
  );
  const syncHeader = Object.fromEntries(
    Object.entries(fileProto).filter(([k]) =>
      [
        'created_at',
        'updated_at',
        'deleted_at',
        'origin_device_id',
        'revision',
        'sync_status',
        'last_synced_at',
      ].includes(k),
    ),
  );
  const start = performance.now();
  for (let offset = 0; offset < count; offset += 500) {
    const end = Math.min(count, offset + 500);
    await store.transaction(
      [
        'case_file',
        'legal_case',
        'case_file_case',
        'case_file_party',
        'procedural_stage',
        'case_term',
        'search_document',
      ],
      async (tx) => {
        for (let i = offset; i < end; i += 1) {
          const fid = uuid(1, i),
            cid = uuid(2, i),
            updated = new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
            title = `ملف اصطناعي ${i}`;
          const type = typeIds[i % 3]!,
            word = i % 100 === 0 ? 'needlebench' : 'generalbench';
          // Compact legacy-like profiles (empty snapshots), as produced by upgrading
          // old files, not 100k copies of a large new-intake template or attachments.
          await tx.put('case_file', {
            ...fileProto,
            id: fid,
            file_number: `FILE-BENCH-${i}`,
            title,
            case_type_id: type,
            specialized_json: '{}',
            template_snapshot_json: '{}',
            updated_at: updated,
          });
          await tx.put('legal_case', {
            ...caseProto,
            id: cid,
            case_number: `BENCH-${i}`,
            case_type_id: type,
            subject: `نزاع اصطناعي ${word}`,
            updated_at: updated,
          });
          await tx.put('case_file_case', {
            ...linkProto,
            id: uuid(3, i),
            file_id: fid,
            case_id: cid,
            updated_at: updated,
          });
          if (i % 5 === 0)
            await tx.put('case_file_party', {
              ...partyProto,
              id: uuid(4, i),
              file_id: fid,
              case_id: cid,
              updated_at: updated,
            });
          if (i % 4 === 0)
            await tx.put('procedural_stage', {
              ...stage,
              id: uuid(5, i),
              file_id: fid,
              case_id: null,
              reference_number: `BENCH-NOTICE-${i}`,
              updated_at: updated,
            });
          if (i % 4 === 0)
            await tx.put('case_term', {
              ...syncHeader,
              id: uuid(6, i),
              file_id: fid,
              case_id: null,
              term_id: term.id!,
              updated_at: updated,
            });
          const body = `نزاع اصطناعي ${word} ${title}`;
          await tx.put('search_document', {
            ...docProto,
            id: i + 100,
            entity_id: cid,
            title: `BENCH-${i} / 2026`,
            body,
            normalized_text: normalizeArabic(body),
            file_id: fid,
            case_type_id: type,
            case_number: `BENCH-${i}`,
            updated_at: updated,
            stage_type_id: i % 4 === 0 ? stage.type_id! : null,
            stage_status_id: i % 4 === 0 ? stage.status_id! : null,
            has_pre_stage: i % 4 === 0 ? 1 : 0,
            has_related: 0,
            has_appeal: 0,
            has_documents: 0,
            has_hearing: 0,
            latest_hearing_at: null,
            needs_next: i % 4 === 0 ? 1 : 0,
            missing_count: 3,
          });
        }
      },
    );
    if (end % 10_000 === 0 || end === count) progress(`seed ${end}/${count}`);
  }
  await store.delete('app_meta', 'sequence.search_document');
  const seedMs = performance.now() - start;
  cache.invalidate();
  return {
    lookups,
    cache,
    cases,
    base,
    term,
    seedMs,
    personId: String(person.party.id),
  };
}
export async function measureCaseBenchmark(
  store: PortableStore,
  prepared: Awaited<ReturnType<typeof prepareCaseBenchmark>>,
  count: number,
  progress: (s: string) => void,
) {
  const { cases, cache, base, term } = prepared;
  const metrics: Record<string, unknown> = {
    engine: store.engine,
    cases: count,
    expectedListTotal: count + 1,
    bulkFixtureMs: +prepared.seedMs.toFixed(2),
    method:
      'Synthetic legacy-like profiles, bulk transaction seeding (not 100k audited UI creates), 20% party links, 25% stages and terms, no attachments. List operations use real CaseService + store, cold record cache per sample.',
  };
  const original = store.query.bind(store),
    originalScan = store.scan.bind(store),
    originalTransaction = store.transaction.bind(store);
  let reads = 0,
    scanBatches = 0,
    returnedRows = 0,
    maxBatch = 0,
    pointReads = 0,
    neighborReads = 0,
    wholeTableReads = 0,
    derivedSearchWrites = 0;
  store.query = async (table, options) => {
    reads += 1;
    const page = await original(table, options);
    returnedRows += page.rows.length;
    maxBatch = Math.max(maxBatch, page.rows.length);
    return page;
  };
  store.scan = async function* (table, options) {
    for await (const rows of originalScan(table, options)) {
      scanBatches += 1;
      returnedRows += rows.length;
      maxBatch = Math.max(maxBatch, rows.length);
      yield rows;
    }
  };
  store.transaction = async (tables, fn) =>
    originalTransaction(tables, async (tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'getAll')
              return async (table: string) => {
                wholeTableReads += 1;
                return target.getAll(table);
              };
            if (key === 'get')
              return async (table: string, id: string | readonly string[]) => {
                pointReads += 1;
                return target.get(table, id);
              };
            if (key === 'getByColumns')
              return async (
                ...args: Parameters<typeof target.getByColumns>
              ) => {
                neighborReads += 1;
                return target.getByColumns(...args);
              };
            if (key === 'put')
              return async (table: string, row: EngineRow) => {
                if (table === 'search_document') derivedSearchWrites += 1;
                return target.put(table, row);
              };
            const value = Reflect.get(target, key);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  const run = async (
    name: string,
    action: () => Promise<unknown>,
    repeats = 3,
  ) => {
    const samples: number[] = [];
    let result: unknown;
    let io: unknown;
    for (let r = 0; r < repeats; r += 1) {
      cache.invalidate();
      reads = 0;
      scanBatches = 0;
      returnedRows = 0;
      maxBatch = 0;
      pointReads = 0;
      neighborReads = 0;
      wholeTableReads = 0;
      derivedSearchWrites = 0;
      const t = performance.now();
      result = await action();
      samples.push(+(performance.now() - t).toFixed(2));
      io = {
        queryCalls: reads,
        scanBatches,
        returnedRows,
        maxReturnedBatch: maxBatch,
        transaction: {
          pointReads,
          neighborReads,
          wholeTableReads,
          derivedSearchWrites,
        },
      };
    }
    metrics[name] = {
      samplesMs: samples,
      medianMs: [...samples].sort((a, b) => a - b)[
        Math.floor(samples.length / 2)
      ],
      io,
      ...(result && typeof result === 'object' && 'total' in result
        ? { total: result.total }
        : {}),
    };
    progress(`${name}: ${JSON.stringify(metrics[name])}`);
    return result;
  };
  const request = {
    search: '',
    filters: {},
    page: 1,
    pageSize: 25,
    sortKey: 'updated',
    sortDir: 'desc' as const,
  };
  const all = (await run('listFirst25', () => cases.list(request))) as {
    total: number;
  };
  if (all.total !== count + 1)
    throw new Error(`wrong exact total ${all.total}`);
  await run('listPage100', () => cases.list({ ...request, page: 100 }));
  const text = (await run('arabicNormalizedText', () =>
    cases.list({ ...request, search: 'needlebench' }),
  )) as { total: number };
  if (text.total !== Math.ceil(count / 100))
    throw new Error(`wrong exact text total ${text.total}`);
  await run('typeFacet', () =>
    cases.list({ ...request, filters: { type: 'labor' } }),
  );
  await run(
    'subjectRelationFacet',
    () => cases.list({ ...request, filters: { term: String(term.id) } }),
    1,
  );
  const party = (await run(
    'partyRelationFacet',
    () => cases.list({ ...request, filters: { party: prepared.personId } }),
    1,
  )) as { total: number };
  if (party.total !== Math.ceil(count / 5) + 1)
    throw new Error('incorrect party relation total');
  await run('dashboardExactCounts', () => cases.indexStats(), 1);
  let editNumber = 0;
  await run('singleIntakeEditWithIncrementalIndex', () =>
    cases.saveIntake({
      fileId: String(base.file.id),
      caseId: String(base.legalCase!.id),
      title: `عنوان اصطناعي معدل للأداء ${++editNumber}`,
      caseTypeCode: 'civil',
      caseNumber: 'BENCH-BASE',
      caseYear: 2026,
      subject: `تعديل اختبار فهرسة محلي ${editNumber}`,
    }),
  );
  store.query = original;
  store.scan = originalScan;
  store.transaction = originalTransaction;
  metrics.storage = store.describe();
  return metrics;
}

/** Reopen uses a new connection/app/cache, but does NOT flush OS/browser caches. */
export async function measureReopenedCasePage(
  db: PortableLawOffice,
  expectedTotal: number,
) {
  const start = performance.now(),
    lookups = await Lookups.load(db),
    cache = new RecordCache(db),
    cases = new CaseService({ db, lookups, cache });
  const page = await cases.list({
    search: '',
    filters: {},
    page: 1,
    pageSize: 25,
    sortKey: 'updated',
    sortDir: 'desc',
  });
  if (page.total !== expectedTotal || page.rows.length !== 25)
    throw new Error('populated reopen lost case rows');
  return {
    lookupsAndFirst25Ms: +(performance.now() - start).toFixed(2),
    total: page.total,
    rows: page.rows.length,
    kind: 'New connection and app/record caches, same process; OS/browser caches not flushed.',
  };
}
