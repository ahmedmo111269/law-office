/**
 * Builds the installable PWA into `dist/`.
 *
 * The app is served from a GitHub Pages project sub-path, so every emitted URL
 * is relative (`./assets/...`). Nothing is fetched at runtime from a CDN: fonts,
 * icons and the service worker all ship in this directory.
 *
 *   npm run build:web
 */
import { build } from 'esbuild';
import { cp, mkdir, readdir, rm, writeFile, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = join(ROOT, 'dist');

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

async function main(): Promise<void> {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(join(OUT, 'assets'), { recursive: true });

  const result = await build({
    entryPoints: [join(ROOT, 'src/ui/main.ts')],
    outdir: join(OUT, 'assets'),
    bundle: true,
    splitting: true,
    format: 'esm',
    target: ['chrome110', 'firefox115', 'safari16'],
    platform: 'browser',
    // Hash-free names keep the service worker precache list stable and let the
    // browser cache fonts permanently; the SW version string handles updates.
    entryNames: 'app',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'fonts/[name]',
    loader: {
      '.woff2': 'file',
      '.woff': 'file',
      '.png': 'file',
      '.svg': 'file',
    },
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    metafile: true,
    define: {
      'process.env.NODE_ENV': '"production"',
    },
    logLevel: 'warning',
  });

  // Static shell files.
  for (const file of ['index.html', 'manifest.webmanifest', 'sw.js']) {
    await cp(join(ROOT, 'web', file), join(OUT, file));
  }
  await cp(join(ROOT, 'web', 'icons'), join(OUT, 'icons'), { recursive: true });
  // This is an application artifact, not a Jekyll documentation site.
  await writeFile(join(OUT, '.nojekyll'), '');

  const generated = (await walk(OUT))
    .map((file) => relative(OUT, file).split(sep).join('/'))
    .filter((file) => !file.endsWith('.map'))
    .sort();

  await writeFile(join(OUT, 'precache.json'), `${JSON.stringify(generated, null, 2)}\n`);

  // Type-check the emitted entry actually loaded.
  const index = await readFile(join(OUT, 'index.html'), 'utf8');
  if (!index.includes('./assets/app.js') || !index.includes('./assets/app.css')) {
    throw new Error('index.html must reference ./assets/app.js and ./assets/app.css');
  }

  const bytes = (await walk(OUT)).length;
  const files = generated.length;
  const outputs = Object.keys(result.metafile?.outputs ?? {}).length;
  console.log(`built dist/ — ${files} files (${bytes} paths, ${outputs} esbuild outputs)`);
  for (const file of generated) console.log(`  ${file}`);
}

await main();
