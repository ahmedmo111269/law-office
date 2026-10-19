import { Workspace } from '../src/ui/state/workspace.ts';
import { IndexedDbDatabase } from '../src/db/indexeddb/indexeddb-adapter.ts';
import { IdbMigrationManager } from '../src/db/indexeddb/idb-migration-manager.ts';
import { IndexedDbStore } from '../src/portable/store.ts';
import { PortableLawOffice } from '../src/portable/portable-database.ts';
import {
  prepareCaseBenchmark,
  measureCaseBenchmark,
  measureReopenedCasePage,
} from './case-benchmark-shared.ts';
const state = window as unknown as {
  __caseBenchmarkDone?: boolean;
  __caseBenchmarkResult?: unknown;
  __caseBenchmarkStatus?: string;
};
(async () => {
  const count = Number(
      new URLSearchParams(location.search).get('count') ?? 10_000,
    ),
    name = 'law-office';
  const opened = performance.now();
  const indexed = await IndexedDbDatabase.open({ name });
  await new IdbMigrationManager(indexed, {
    appVersion: '0.3.0-benchmark',
  }).migrate();
  const store = new IndexedDbStore(indexed),
    db = await PortableLawOffice.open({
      store,
      appVersion: '0.3.0-benchmark',
      platform: 'web',
    });
  const openMs = performance.now() - opened,
    progress = (status: string) => {
      state.__caseBenchmarkStatus = status;
      console.log(status);
    };
  try {
    const prepared = await prepareCaseBenchmark(db, store, count, progress);
    const metrics = await measureCaseBenchmark(
      store,
      prepared,
      count,
      progress,
    );
    metrics.openMs = +openMs.toFixed(2);
    metrics.userAgent = navigator.userAgent;
    if (count <= 10_000) {
      let t = performance.now();
      const payload = await db.exportBackup();
      metrics.logicalBackup = {
        ms: +(performance.now() - t).toFixed(2),
        bytes: new Blob([JSON.stringify(payload)]).size,
      };
      t = performance.now();
      const verification = await db.verifyBackup(payload);
      metrics.logicalVerify = {
        ms: +(performance.now() - t).toFixed(2),
        ok: verification.valid,
        rows: verification.totalRows,
      };
      if (!verification.valid)
        throw new Error(verification.errors.slice(0, 4).join(';'));
      await store.put('app_meta', {
        key: 'cases.index_version',
        value: '0',
        updated_at: new Date().toISOString(),
      });
      await store.close();
      const messages: string[] = [];
      t = performance.now();
      const workspace = await Workspace.open((message) =>
        messages.push(message),
      );
      try {
        const ms = +(performance.now() - t).toFixed(2);
        metrics.explicitCaseRebuild = {
          ms,
          documents: await workspace.db.store.count('search_document'),
          mode: 'Actual Workspace.open on populated pending index; includes startup, not only the rebuild API',
          progressEvents: messages.length,
          lastProgress: messages.at(-1),
          finishedBeyondFormer20SecondLimit: ms > 20_000,
          indexVersion: (
            await workspace.db.store.get('app_meta', 'cases.index_version')
          )?.value,
        };
      } finally {
        await workspace.handle.close();
      }
    } else
      metrics.maintenance =
        '100k full backup/rebuild not measured in this run; 10k measured separately';
    await store.close();
    const reopenedAt = performance.now(),
      reopenedIndexed = await IndexedDbDatabase.open({ name });
    try {
      await new IdbMigrationManager(reopenedIndexed, {
        appVersion: '0.3.0-benchmark',
      }).migrate();
      const reopened = await PortableLawOffice.open({
        store: new IndexedDbStore(reopenedIndexed),
        appVersion: '0.3.0-benchmark',
        platform: 'web',
      });
      const connectionMs = +(performance.now() - reopenedAt).toFixed(2);
      metrics.populatedReopen = {
        connectionMs,
        ...(await measureReopenedCasePage(reopened, count + 1)),
      };
    } finally {
      await reopenedIndexed.close();
    }
    const storage = await navigator.storage.estimate();
    metrics.browserStorage = {
      usageBytes: storage.usage,
      quotaBytes: storage.quota,
    };
    state.__caseBenchmarkResult = metrics;
  } finally {
    await store.close();
  }
})()
  .catch((error) => {
    state.__caseBenchmarkResult = { error: String(error), stack: error?.stack };
  })
  .finally(() => {
    state.__caseBenchmarkDone = true;
  });
