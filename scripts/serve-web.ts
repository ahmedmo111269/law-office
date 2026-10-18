/**
 * Static server for the built PWA. Mirrors how GitHub Pages serves
 * `/law-office/` (a project sub-path) so path bugs surface before deploy.
 *
 *   npm run serve:web -- --port 8080 --base /law-office/
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const args = process.argv.slice(2);
function arg(name: string, fallback: string): string {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
}

const PORT = Number(arg('port', process.env.PORT ?? '4173'));
const BASE = arg('base', '/');
const ROOT = new URL('../dist/', import.meta.url).pathname;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (!pathname.startsWith(BASE)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(`outside base ${BASE}`);
    return;
  }
  pathname = pathname.slice(BASE.length);
  if (pathname === '' || pathname.endsWith('/')) pathname += 'index.html';
  const safe = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const file = join(ROOT, safe);
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
      'service-worker-allowed': BASE,
      'x-content-type-options': 'nosniff',
    });
    response.end(body);
  } catch {
    // SPA fallback for hash routing (Pages returns 404 for unknown paths).
    try {
      const body = await readFile(join(ROOT, 'index.html'));
      response.writeHead(200, { 'content-type': TYPES['.html'] });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`serving dist/ at http://0.0.0.0:${PORT}${BASE}`);
});
