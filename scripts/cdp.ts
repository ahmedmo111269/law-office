/**
 * Small Chrome DevTools Protocol driver used by the browser tests.
 * It launches the same @sparticuz/chromium binary as the storage self-test so
 * no extra browser download is needed.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { extname, join, normalize } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import chromium from '@sparticuz/chromium';

const SESSION_DIR = join(tmpdir(), 'lawo-ui-chromium');
const CHROMIUM = join(SESSION_DIR, 'chromium');
const LIB_DIR = join(tmpdir(), 'lawo-chromium-lib');

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
  });
}

export async function prepareChromium(): Promise<string> {
  if (!existsSync(CHROMIUM)) {
    mkdirSync(SESSION_DIR, { recursive: true });
    const extracted = await chromium.executablePath();
    if (extracted !== CHROMIUM && existsSync(extracted)) {
      writeFileSync(CHROMIUM, readFileSync(extracted), { mode: 0o755 });
    }
  }
  if (!existsSync(LIB_DIR)) {
    mkdirSync(LIB_DIR, { recursive: true });
    const archive = brotliDecompressSync(
      readFileSync(join(process.cwd(), 'node_modules', '@sparticuz', 'chromium', 'bin', 'al2023.tar.br')),
    );
    const tarPath = join(LIB_DIR, 'libs.tar');
    writeFileSync(tarPath, archive);
    await run('tar', ['-xf', tarPath, '-C', LIB_DIR]);
  }
  if (!existsSync(CHROMIUM)) throw new Error('chromium binary was not extracted');
  return CHROMIUM;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

export interface StaticServer {
  url: string;
  close(): Promise<void>;
}

/** Serves a directory under a GitHub-Pages-style base path. */
export async function serveDirectory(root: string, base = '/law-office/'): Promise<StaticServer> {
  const server = createServer(async (request, response) => {
    let pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://x').pathname);
    if (pathname.startsWith(base)) pathname = pathname.slice(base.length);
    else if (pathname === '/') pathname = '';
    else {
      response.writeHead(404).end('outside base');
      return;
    }
    if (pathname === '' || pathname.endsWith('/')) pathname += 'index.html';
    const file = join(root, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
    try {
      if (!statSync(file).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      response.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'service-worker-allowed': base,
      });
      response.end(body);
    } catch {
      response.writeHead(404).end('not found');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('server did not bind');
  return {
    url: `http://127.0.0.1:${address.port}${base}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export class CdpSession {
  private socket: WebSocket;
  private nextId = 1;
  private pending = new Map<number, (value: unknown) => void>();
  readonly consoleErrors: string[] = [];
  readonly pageErrors: string[] = [];

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        method?: string;
        result?: unknown;
        error?: { message: string };
        params?: Record<string, unknown>;
      };
      if (message.method === 'Runtime.consoleAPICalled') {
        const params = message.params as { type?: string; args?: Array<{ value?: unknown; description?: string }> };
        if (params.type === 'error') {
          const text = (params.args ?? []).map((arg) => String(arg.value ?? arg.description ?? '')).join(' ');
          this.consoleErrors.push(text);
        }
        return;
      }
      if (message.method === 'Runtime.exceptionThrown') {
        const params = message.params as { exceptionDetails?: { text?: string; exception?: { description?: string } } };
        this.pageErrors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'unknown exception');
        return;
      }
      if (typeof message.id !== 'number') return;
      const resolve = this.pending.get(message.id);
      if (!resolve) return;
      this.pending.delete(message.id);
      if (message.error) throw new Error(`CDP error: ${message.error.message}`);
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

  async evaluate<T>(expression: string): Promise<T> {
    const result = (await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true,
    })) as {
      result?: { value?: T };
      exceptionDetails?: { text: string; exception?: { description?: string; value?: unknown } };
    };
    if (result.exceptionDetails) {
      const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
      throw new Error(`page exception: ${detail}`);
    }
    return result.result?.value as T;
  }

  async waitFor<T>(expression: string, description: string, timeoutMs = 20_000): Promise<T> {
    const started = Date.now();
    for (;;) {
      const value = await this.evaluate<T | null>(expression);
      if (value !== null && value !== undefined && value !== false) return value;
      if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${description}`);
      await delay(100);
    }
  }

  close(): void {
    this.socket.close();
  }
}

export interface Browser {
  session: CdpSession;
  stop(): Promise<void>;
}

export async function launchBrowser(executable: string, profile: string): Promise<Browser> {
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const child: ChildProcess = spawn(
    executable,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-zygote',
      '--disable-background-networking',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    {
      env: { ...process.env, LD_LIBRARY_PATH: `${LIB_DIR}:${join(LIB_DIR, 'lib')}` },
      stdio: ['ignore', 'ignore', 'pipe'],
    },
  );
  child.stderr?.on('data', () => undefined);
  const portFile = join(profile, 'DevToolsActivePort');
  let port = 0;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(portFile)) {
      port = Number(readFileSync(portFile, 'utf8').split('\n')[0]);
      if (Number.isInteger(port) && port > 0) break;
    }
    if (child.exitCode !== null) throw new Error(`chromium exited with ${child.exitCode}`);
    await delay(50);
  }
  if (!port) throw new Error('chromium did not expose a DevTools port');
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
  const target = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!target.webSocketDebuggerUrl) throw new Error('no browser target');
  const session = await CdpSession.connect(target.webSocketDebuggerUrl);
  await session.send('Runtime.enable');
  await session.send('Page.enable');
  return {
    session,
    stop: async () => {
      session.close();
      child.kill('SIGTERM');
      await delay(300);
      if (child.exitCode === null) child.kill('SIGKILL');
    },
  };
}

export async function goto(session: CdpSession, url: string): Promise<void> {
  await session.send('Page.navigate', { url });
  await delay(300);
}

/** Sets viewport size so responsive rules apply like on a real device. */
export async function setViewport(session: CdpSession, width: number, height: number): Promise<void> {
  await session.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
}
