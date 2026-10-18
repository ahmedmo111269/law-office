/** Quick smoke probe: boot the built app in Chromium and report console errors. */
import { goto, launchBrowser, prepareChromium, serveDirectory } from './cdp.ts';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const executable = await prepareChromium();
const server = await serveDirectory(join(process.cwd(), 'dist'));
const browser = await launchBrowser(executable, join(tmpdir(), 'lawo-probe-profile'));
try {
  await goto(browser.session, server.url);
  const ready = await browser.session.evaluate<boolean>('Boolean(document.querySelector(".app-shell"))');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const state = await browser.session.evaluate<Record<string, unknown>>(`(() => ({
    ready: document.body.classList.contains('app-ready'),
    shell: Boolean(document.querySelector('.app-shell')),
    route: location.hash,
    pageTitle: document.title,
    heading: document.querySelector('.page-title, .hero-band__title')?.textContent ?? null,
    mainChildren: document.querySelector('.app-main')?.children.length ?? 0,
    navLinks: document.querySelectorAll('.nav-link').length,
    boot: Boolean(document.querySelector('.boot-screen')),
  }))()`);
  console.log(JSON.stringify({ ready, state, consoleErrors: browser.session.consoleErrors, pageErrors: browser.session.pageErrors }, null, 2));
} finally {
  await browser.stop();
  await server.close();
}
