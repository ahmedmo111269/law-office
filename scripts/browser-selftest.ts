/**
 * Real-browser IndexedDB persistence + offline test.
 *
 *   node --disable-warning=ExperimentalWarning scripts/browser-selftest.ts
 *
 * Requirements: `@sparticuz/chromium` (installs a self-contained Chromium from
 * the npm registry) and `esbuild`. The script:
 *   1. bundles the browser harness with esbuild,
 *   2. serves it from 127.0.0.1 (local only),
 *   3. starts headless Chromium with a persistent profile and runs phase=write,
 *   4. kills the browser process, restarts it with the same profile,
 *   5. runs phase=verify with the network emulated offline.
 *
 * Passing means data created by one browser process was read back by a second
 * process from real browser IndexedDB, with the network switched off.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import chromium from '@sparticuz/chromium';

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'dist', 'browser-selftest');
const PROFILE = join(tmpdir(), 'lawo-chromium-profile');
const LIB_DIR = join(tmpdir(), 'lawo-chromium-lib');
const CHROMIUM = join(tmpdir(), 'lawo-chromium', 'chromium');

interface HarnessResult {
  phase: string;
  engine: string;
  userAgent?: string;
  personId?: string;
  fileId?: string;
  caseId?: string;
  counts?: Record<string, number>;
  backupValid?: boolean;
  backupRows?: number;
  backupBytes?: number;
  searchHits?: number;
  relations?: { fileParties: number; caseHearings: number; judgmentFiles: number };
  integrity?: { ok: boolean; errors: string[]; tables: number; indexes: number };
  offline?: { externalFetchFailed: boolean; writeSucceeded: boolean; readAfterWrite: boolean };
  migrations?: { valid: boolean; version: number };
  error?: string;
}

function fail(message: string): never {
  console.error(`FAIL ${message}`);
  process.exit(1);
}

function assert(condition: unknown, message: string): void {
  if (!condition) fail(message);
}

async function prepareBrowser(): Promise<string> {
  if (!existsSync(CHROMIUM)) {
    const extracted = await chromium.executablePath();
    mkdirSync(join(tmpdir(), 'lawo-chromium'), { recursive: true });
    if (extracted !== CHROMIUM && existsSync(extracted)) {
      // executablePath() extracts to a shared location; copy beside our libs.
      writeFileSync(CHROMIUM, readFileSync(extracted), { mode: 0o755 });
    }
  }
  if (!existsSync(LIB_DIR)) {
    mkdirSync(LIB_DIR, { recursive: true });
    const archive = brotliDecompressSync(
      readFileSync(join(ROOT, 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br')),
    );
    const tarPath = join(LIB_DIR, 'libs.tar');
    writeFileSync(tarPath, archive);
    await run('tar', ['-xf', tarPath, '-C', LIB_DIR]);
  }
  assert(existsSync(CHROMIUM), 'chromium binary was not extracted');
  return CHROMIUM;
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

async function startServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer((request, response) => {
    const url = request.url ?? '/';
    const file = url.startsWith('/bundle.js')
      ? join(OUT_DIR, 'bundle.js')
      : join(OUT_DIR, 'index.html');
    if (!existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    const type = file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8';
    response.writeHead(200, {
      'content-type': type,
      'cache-control': 'no-store',
      // Not a PWA manifest test: the page is served from a local origin only.
    });
    response.end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let browser: ChildProcess | null = null;
let debugPort = 0;

async function launchBrowser(executable: string, offline: boolean): Promise<void> {
  rmSync(join(PROFILE, 'DevToolsActivePort'), { force: true });
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-zygote',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ];
  browser = spawn(executable, args, {
    env: { ...process.env, LD_LIBRARY_PATH: `${LIB_DIR}:${join(LIB_DIR, 'lib')}` },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  browser.stderr?.on('data', () => undefined);
  const portFile = join(PROFILE, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(portFile)) {
      debugPort = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
      if (Number.isInteger(debugPort) && debugPort > 0) break;
    }
    if (browser.exitCode !== null) fail(`chromium exited early with code ${browser.exitCode}`);
    await delay(50);
  }
  assert(debugPort > 0, 'chromium did not expose a DevTools port');
  if (offline) {
    // Nothing to do here; the caller switches the page network off via CDP.
  }
}

async function stopBrowser(): Promise<void> {
  if (!browser) return;
  const child = browser;
  browser = null;
  child.kill('SIGTERM');
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
    child.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function newTarget(url: string): Promise<string> {
  const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
    method: 'PUT',
  });
  if (!response.ok) fail(`cannot create browser target: ${response.status}`);
  const target = (await response.json()) as { webSocketDebuggerUrl?: string };
  assert(target.webSocketDebuggerUrl, 'target has no websocket url');
  return target.webSocketDebuggerUrl!;
}

class CdpSession {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, (value: unknown) => void>();

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: { message: string };
      };
      if (typeof message.id !== 'number') return;
      const resolve = this.pending.get(message.id);
      if (!resolve) return;
      this.pending.delete(message.id);
      if (message.error) fail(`CDP error: ${message.error.message}`);
      resolve(message.result);
    };
  }

  static async connect(url: string): Promise<CdpSession> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('cannot connect to the browser websocket'));
    });
    return new CdpSession(socket);
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.socket.close();
  }
}

async function evaluate<T>(session: CdpSession, expression: string): Promise<T> {
  const result = (await session.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })) as { result?: { value?: T }; exceptionDetails?: { text: string } };
  if (result.exceptionDetails) fail(`page exception: ${result.exceptionDetails.text}`);
  return result.result?.value as T;
}

async function waitForResult(session: CdpSession, timeoutMs = 60_000): Promise<HarnessResult> {
  const started = Date.now();
  for (;;) {
    const result = await evaluate<HarnessResult | null>(session, 'window.__lawoResult ?? null');
    if (result) return result;
    if (Date.now() - started > timeoutMs) fail('timed out waiting for the page self-test');
    await delay(200);
  }
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });
  rmSync(PROFILE, { recursive: true, force: true });
  writeFileSync(
    join(OUT_DIR, 'index.html'),
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>LAWO IndexedDB self-test</title></head><body><p>running…</p><script type="module" src="/bundle.js"></script></body></html>',
  );
  await build({
    entryPoints: [join(ROOT, 'scripts', 'browser-selftest-harness.ts')],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    outfile: join(OUT_DIR, 'bundle.js'),
    logLevel: 'warning',
  });

  const executable = await prepareBrowser();
  const server = await startServer();
  const results: Record<string, HarnessResult> = {};
  try {
    await launchBrowser(executable, false);
    const writeSession = await CdpSession.connect(await newTarget(`${server.url}?phase=write`));
    await writeSession.send('Runtime.enable');
    const write = await waitForResult(writeSession);
    writeSession.close();
    if (write.error) fail(`write phase: ${write.error}`);
    results.write = write;
    assert(write.engine === 'indexeddb', 'page did not use the IndexedDB engine');
    assert(write.backupValid, 'backup produced in the browser did not verify');
    assert((write.counts?.audit_log ?? 0) > 0, 'no audit rows were written');
    await stopBrowser();

    await launchBrowser(executable, true);
    const verifySession = await CdpSession.connect(await newTarget(`${server.url}?phase=verify`));
    await verifySession.send('Runtime.enable');
    await verifySession.send('Network.enable');
    await verifySession.send('Network.setBlockedURLs', { urls: ['*'] });
    await verifySession.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    const verify = await waitForResult(verifySession);
    verifySession.close();
    if (verify.error) fail(`verify phase: ${verify.error}`);
    results.verify = verify;
    assert(verify.personId === write.personId, 'party id changed after a browser restart');
    assert(verify.fileId === write.fileId, 'file id changed after a browser restart');
    assert(verify.caseId === write.caseId, 'case id changed after a browser restart');
    assert((verify.searchHits ?? 0) >= 1, 'persisted data was not searchable after restart');
    assert(verify.relations?.fileParties === 1, 'file relations were not restored');
    assert(verify.relations?.caseHearings === 2, 'hearing relations were not restored');
    assert(verify.relations?.judgmentFiles === 1, 'judgment relations were not restored');
    assert(verify.backupValid, 'backup of the restarted database did not verify');
    assert(verify.integrity?.ok, `integrity check failed: ${verify.integrity?.errors.join('; ')}`);
    assert(verify.migrations?.valid, 'migration ledger did not verify');
    assert(verify.offline?.externalFetchFailed, 'external network request unexpectedly succeeded');
    assert(verify.offline?.writeSucceeded, 'write failed while offline');
    assert(verify.offline?.readAfterWrite, 'read-back failed while offline');
    await stopBrowser();
  } finally {
    await stopBrowser();
    await server.close();
  }

  const summary = {
    browser: results.verify?.userAgent ?? results.write?.userAgent,
    engine: results.write?.engine,
    restart: {
      personPersisted: results.verify?.personId === results.write?.personId,
      filePersisted: results.verify?.fileId === results.write?.fileId,
      casePersisted: results.verify?.caseId === results.write?.caseId,
      searchHitsAfterRestart: results.verify?.searchHits,
      relations: results.verify?.relations,
      integrity: results.verify?.integrity,
      migrations: results.verify?.migrations,
    },
    offline: results.verify?.offline,
    backup: {
      valid: results.verify?.backupValid,
      rows: results.verify?.backupRows,
      bytes: results.verify?.backupBytes,
    },
    counts: results.verify?.counts,
  };
  writeFileSync(join(OUT_DIR, 'result.json'), JSON.stringify({ results, summary }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log('PASS real-browser IndexedDB persistence and offline storage test');
}

await main().catch(async (error: unknown) => {
  await stopBrowser();
  console.error('FAIL', error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
