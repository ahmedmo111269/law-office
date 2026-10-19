/** Actual SQLite + real Chromium/IndexedDB measurements, never fake-IDB timings. */
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { cpus, totalmem, tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import { LawOfficeDatabase } from '../src/app/law-office-database.ts';
import { PortableLawOffice } from '../src/portable/portable-database.ts';
import { SqlitePortableStore } from '../src/portable/store.ts';
import {
  prepareCaseBenchmark,
  measureCaseBenchmark,
  measureReopenedCasePage,
} from './case-benchmark-shared.ts';
import { goto, launchBrowser, prepareChromium, serveDirectory } from './cdp.ts';
const count = Number(
  process.argv.find((a) => a.startsWith('--count='))?.split('=')[1] ?? 10_000,
);
const engine =
  process.argv.find((a) => a.startsWith('--engine='))?.split('=')[1] ??
  'sqlite';
if (
  ![10_000, 100_000].includes(count) ||
  !['sqlite', 'indexeddb'].includes(engine)
)
  throw new Error(
    'Use --count=10000|100000 --engine=sqlite|indexeddb (throwaway only).',
  );
mkdirSync('.arena', { recursive: true });
let result: Record<string, unknown>;
const start = Date.now();
if (engine === 'sqlite') {
  const path = join(process.cwd(), '.arena', `case-benchmark-${count}.sqlite`);
  for (const p of [path, `${path}-wal`, `${path}-shm`])
    rmSync(p, { force: true });
  const opened = performance.now(),
    native = LawOfficeDatabase.open({
      path,
      appVersion: '0.3.0-benchmark',
      deviceLabel: 'Disposable case benchmark',
      backupDir: join(process.cwd(), '.arena', 'case-benchmark-backups'),
    }).database;
  const store = new SqlitePortableStore(native.db),
    db = await PortableLawOffice.open({ store, appVersion: '0.3.0-benchmark' }),
    openMs = performance.now() - opened;
  try {
    const prepared = await prepareCaseBenchmark(db, store, count, (message) =>
      console.log(message),
    );
    result = await measureCaseBenchmark(store, prepared, count, (message) =>
      console.log(message),
    );
    result.openMs = +openMs.toFixed(2);
    if (count <= 10_000) {
      let t = performance.now();
      const payload = await db.exportBackup();
      result.logicalBackup = {
        ms: +(performance.now() - t).toFixed(2),
        bytes: Buffer.byteLength(JSON.stringify(payload)),
      };
      t = performance.now();
      const verification = await db.verifyBackup(payload);
      result.logicalVerify = {
        ms: +(performance.now() - t).toFixed(2),
        ok: verification.valid,
        rows: verification.totalRows,
      };
      if (!verification.valid)
        throw new Error(verification.errors.slice(0, 4).join(';'));
      t = performance.now();
      const rebuild = await db.rebuildCaseIndex();
      result.explicitCaseRebuild = {
        ms: +(performance.now() - t).toFixed(2),
        documents: rebuild.documents,
      };
    } else
      result.maintenance =
        '100k full backup/rebuild not measured in this run; 10k measured separately';
    result.sqliteInReferencePlan = native.db.query(
      "EXPLAIN QUERY PLAN SELECT * FROM search_document WHERE case_scope IN ('case','intake') ORDER BY updated_at DESC,id DESC LIMIT 25",
    );
    result.sqliteScopeMergeSamplePlan = native.db.query(
      "EXPLAIN QUERY PLAN SELECT * FROM (SELECT * FROM (SELECT * FROM search_document WHERE case_scope IN ('case','intake') AND case_scope='case' ORDER BY updated_at DESC,id DESC LIMIT 25) UNION ALL SELECT * FROM (SELECT * FROM search_document WHERE case_scope IN ('case','intake') AND case_scope='intake' ORDER BY updated_at DESC,id DESC LIMIT 25)) ORDER BY updated_at DESC,id DESC LIMIT 25 OFFSET 0",
    );
    result.nativeForeignKeys = native.db.query(
      'PRAGMA foreign_key_check',
    ).length;
    native.close();
    const reopenedAt = performance.now(),
      reopenedNative = LawOfficeDatabase.open({
        path,
        appVersion: '0.3.0-benchmark',
        backupDir: join(process.cwd(), '.arena', 'case-benchmark-backups'),
      }).database;
    try {
      const reopened = await PortableLawOffice.open({
        store: new SqlitePortableStore(reopenedNative.db),
        appVersion: '0.3.0-benchmark',
      });
      const connectionMs = +(performance.now() - reopenedAt).toFixed(2);
      result.populatedReopen = {
        connectionMs,
        ...(await measureReopenedCasePage(reopened, count + 1)),
      };
    } finally {
      reopenedNative.close();
    }
  } finally {
    native.close();
  }
  result.fileSizeBytes = statSync(path).size;
  for (const p of [path, `${path}-wal`, `${path}-shm`])
    rmSync(p, { force: true });
} else {
  const folder = join(process.cwd(), '.arena', 'case-benchmark-site');
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, 'index.html'),
    '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>قياس مؤقت — بيانات اصطناعية فقط</title><script type="module" src="./benchmark.js"></script></html>',
  );
  await build({
    entryPoints: ['scripts/case-benchmark-browser.ts'],
    outfile: join(folder, 'benchmark.js'),
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: 'es2022',
  });
  const server = await serveDirectory(folder),
    browser = await launchBrowser(
      await prepareChromium(),
      join(tmpdir(), `midad-case-benchmark-${count}`),
    );
  try {
    await goto(browser.session, `${server.url}?count=${count}`);
    await browser.session.waitFor(
      'window.__caseBenchmarkDone',
      'real IndexedDB benchmark',
      1_500_000,
    );
    result = await browser.session.evaluate<Record<string, unknown>>(
      'window.__caseBenchmarkResult',
    );
    if (result.error) throw new Error(JSON.stringify(result));
    if (browser.session.pageErrors.length)
      throw new Error(browser.session.pageErrors.join(';'));
  } finally {
    await browser.stop();
    await server.close();
  }
}
result.environment = {
  date: new Date().toISOString(),
  node: process.version,
  os: process.platform,
  cpus: cpus().length,
  cpu: cpus()[0]?.model,
  totalMemoryBytes: totalmem(),
};
result.totalWallMs = Date.now() - start;
const output = join('.arena', `case-benchmark-${engine}-${count}.json`);
writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
console.log(`Saved ${output}`);
