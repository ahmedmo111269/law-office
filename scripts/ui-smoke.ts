/**
 * Route and responsive smoke suite for the built app.
 *
 * Seeds a few real records through the UI (dialogs → services → IndexedDB),
 * then walks every registered route at desktop width and checks that each page
 * renders a heading, its document title, and no console/page errors. Finally
 * it scans a representative set of routes at 320/390/768/1024/1280/1440 for
 * horizontal overflow.
 *
 * Run with: npm run test:smoke
 */
import { goto, launchBrowser, prepareChromium, serveDirectory, type CdpSession } from './cdp.ts';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function record(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function js<T>(session: CdpSession, expression: string): Promise<T> {
  return session.evaluate<T>(expression);
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(session: CdpSession, expression: string, label: string, timeout = 15_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      if (await js<boolean>(session, `Boolean(${expression})`)) return;
    } catch {
      // The execution context is destroyed during navigation; retry.
    }
    if (Date.now() - started > timeout) throw new Error(`timeout: ${label}`);
    await delay(150);
  }
}

async function fill(session: CdpSession, selector: string, value: string): Promise<void> {
  const ok = await js<boolean>(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`fill target missing: ${selector}`);
}

async function submitDialog(session: CdpSession): Promise<void> {
  await js<boolean>(session, `(() => { const form = document.querySelector('.dialog form'); if (!form) return false; form.requestSubmit(); return true; })()`);
  await waitFor(session, '!document.querySelector(".dialog")', 'dialog closed', 20_000);
}

async function readStore(session: CdpSession, store: string): Promise<Array<Record<string, unknown>>> {
  return js<Array<Record<string, unknown>>>(session, `(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('law-office');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const request = db.transaction(${JSON.stringify(store)}, 'readonly').objectStore(${JSON.stringify(store)}).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows;
  })()`);
}

async function overflow(session: CdpSession): Promise<number> {
  return js<number>(session, `Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)`);
}

const executable = await prepareChromium();
const server = await serveDirectory(join(process.cwd(), 'dist'));
const browser = await launchBrowser(executable, join(tmpdir(), 'lawo-smoke-profile'));
const session = browser.session;

try {
  // ---------------------------------------------------------------- seeding
  await goto(session, `${server.url}#/clients?new=1`);
  await waitFor(session, 'Boolean(document.querySelector(".dialog [name=firstName]"))', 'client dialog');
  await fill(session, '.dialog [name=firstName]', 'أحمد');
  await fill(session, '.dialog [name=lastName]', 'السيد');
  await submitDialog(session);

  await goto(session, `${server.url}#/files?new=1`);
  await waitFor(session, 'Boolean(document.querySelector(".dialog [name=title]"))', 'file dialog');
  await fill(session, '.dialog [name=title]', 'نزاع تعاقدي — شركة النيل');
  await submitDialog(session);

  await goto(session, `${server.url}#/cases?new=1`);
  await waitFor(session, 'Boolean(document.querySelector(".dialog [name=caseNumber]"))', 'case dialog');
  await fill(session, '.dialog [name=caseNumber]', '1234');
  await submitDialog(session);

  await goto(session, `${server.url}#/appointments?new=1`);
  await waitFor(session, 'Boolean(document.querySelector(".dialog [name=title]"))', 'appointment dialog');
  await fill(session, '.dialog [name=title]', 'مقابلة موكل');
  await submitDialog(session);

  await goto(session, `${server.url}#/documents?new=1`);
  await waitFor(session, 'Boolean(document.querySelector(".dialog [name=title]"))', 'document dialog');
  await fill(session, '.dialog [name=title]', 'مذكرة دفاع');
  await submitDialog(session);

  const clients = await readStore(session, 'party');
  const files = await readStore(session, 'case_file');
  const cases = await readStore(session, 'legal_case');
  const client = clients.find((row) => String(row.display_name).includes('أحمد'));
  const file = files.find((row) => String(row.title).includes('النيل'));
  const legalCase = cases[0];
  record(
    'S1 بذر بيانات حقيقية عبر الواجهة',
    Boolean(client && file && legalCase),
    `client=${Boolean(client)} file=${Boolean(file)} case=${Boolean(legalCase)}`,
  );

  // ------------------------------------------------- dialog default values
  const dialogRoutes = [
    { path: '/clients', label: 'عميل جديد' },
    { path: '/parties', label: 'طرف جديد' },
    { path: '/files', label: 'ملف جديد' },
    { path: '/cases', label: 'دعوى جديدة' },
    { path: '/appointments', label: 'موعد جديد' },
    { path: '/documents', label: 'مستند جديد' },
    { path: '/tasks', label: 'مهمة جديدة' },
    { path: '/finance?tab=charges&new=1', label: 'مستحق جديد' },
  ];
  for (const entry of dialogRoutes) {
    await goto(session, `${server.url}#${entry.path}${entry.path.includes('?') ? '' : '?new=1'}`);
    await waitFor(session, 'Boolean(document.querySelector(".dialog"))', `dialog ${entry.path}`, 20_000);
    await delay(300);
    const selects = await js<Array<{ name: string; value: string; required: boolean; options: number }>>(session, `[...document.querySelectorAll('.dialog select')].map((el) => ({
      name: el.name,
      value: el.value,
      required: el.required,
      options: el.options.length,
    }))`);
    // Optional selects may stay empty by design (no value chosen yet), and a
    // list with a single placeholder option just means the office has no rows
    // yet (e.g. courts). Required selects, however, must arrive with a valid
    // seeded value: a typo in a lookup code silently blanks the field.
    const bad = selects.filter((select) => select.options >= 2 && select.required && select.value === '');
    record(
      `D ${entry.label}`,
      bad.length === 0,
      bad.length ? bad.map((select) => `${select.name}=${select.value || '∅'}/${select.options}`).join(' ') : `${selects.length} selects ok`,
    );
    await js<boolean>(session, `(() => {
      const close = document.querySelector('.dialog [aria-label="إغلاق"], .dialog [aria-label="إغلاق النافذة"]');
      if (close) { close.click(); return true; }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return false;
    })()`);
    await waitFor(session, '!document.querySelector(".dialog")', `dialog closed ${entry.path}`, 10_000).catch(() => undefined);
  }

  const routes: Array<{ path: string; label: string }> = [
    { path: '/today', label: 'مكتب اليوم' },
    { path: '/tasks', label: 'المهام' },
    { path: '/appointments', label: 'المواعيد' },
    { path: '/files', label: 'الملفات' },
    ...(file ? [{ path: `/files/${String(file.id)}`, label: 'ملف' }] : []),
    { path: '/clients', label: 'العملاء' },
    ...(client ? [{ path: `/clients/${String(client.id)}`, label: 'ملف عميل' }] : []),
    { path: '/parties', label: 'الأطراف' },
    ...(client ? [{ path: `/parties/${String(client.id)}`, label: 'طرف' }] : []),
    { path: '/cases', label: 'القضايا' },
    ...(legalCase ? [{ path: `/cases/${String(legalCase.id)}`, label: 'قضية' }] : []),
    { path: '/hearings', label: 'الجلسات' },
    { path: '/judgments', label: 'الأحكام' },
    { path: '/execution', label: 'التنفيذ' },
    { path: '/announcements', label: 'الإعلانات' },
    { path: '/documents', label: 'المستندات' },
    { path: '/contracts', label: 'العقود' },
    { path: '/finance', label: 'المالية' },
    { path: '/reports', label: 'التقارير' },
    { path: '/archive', label: 'الأرشيف' },
    { path: '/settings', label: 'الإعدادات' },
    { path: '/search?q=أحمد', label: 'البحث' },
  ];

  // ----------------------------------------------------------- route checks
  await session.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });
  for (const route of routes) {
    const before = { page: session.pageErrors.length, console: session.consoleErrors.length };
    await goto(session, `${server.url}#${route.path}`);
    await waitFor(session, '(document.body && document.body.classList.contains("app-ready"))', `ready ${route.path}`);
    await waitFor(session, 'Boolean(document.querySelector(".page-title, .hero-band__title"))', `heading ${route.path}`);
    await delay(350);
    const state = await js<{ heading: string; title: string; boot: boolean; overflow: number; text: string }>(session, `(() => ({
      heading: (document.querySelector('.page-title, .hero-band__title')?.textContent ?? '').trim(),
      title: document.title,
      boot: Boolean(document.querySelector('.boot-screen, .boot-failure')),
      overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
      text: (document.querySelector('.app-main')?.textContent ?? '').slice(0, 400),
    }))()`);
    const pageErrors = session.pageErrors.slice(before.page);
    const consoleErrors = session.consoleErrors.filter((text) => !text.includes('[midad]')).slice(before.console);
    const broken = state.text.includes('تعذر فتح الصفحة') || state.text.includes('حدث خطأ غير متوقع');
    record(
      `R ${route.label} (${route.path})`,
      state.heading.length > 0 && state.title.length > 0 && !state.boot && !broken && state.overflow === 0 && pageErrors.length === 0 && consoleErrors.length === 0,
      [
        `heading=${state.heading.slice(0, 40)}`,
        `overflow=${state.overflow}`,
        ...(broken ? ['error-surface'] : []),
        ...(pageErrors.length ? [`pageErrors=${pageErrors.slice(0, 2).join(' | ')}`] : []),
        ...(consoleErrors.length ? [`console=${consoleErrors.slice(0, 2).join(' | ')}`] : []),
      ].join(' '),
    );
  }

  // --------------------------------------------------------- responsive scan
  const widths = [320, 390, 768, 1024, 1280, 1440];
  const responsiveRoutes = ['/today', '/files', '/cases', '/finance', '/settings'];
  for (const width of widths) {
    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: width < 500 ? 780 : 950,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    for (const route of responsiveRoutes) {
      await goto(session, `${server.url}#${route}`);
      await waitFor(session, '(document.body && document.body.classList.contains("app-ready"))', `ready ${width} ${route}`);
      await delay(220);
      const over = await overflow(session);
      const chrome = await js<{ nav: boolean; sidebar: number; labels: boolean; menu: boolean }>(session, `(() => {
        const nav = document.querySelector('.bottom-nav');
        const sidebar = document.querySelector('.sidebar');
        const label = document.querySelector('.nav-link__label');
        const menu = document.querySelector('.topbar-menu');
        return {
          nav: Boolean(nav && getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height > 0),
          sidebar: sidebar ? Math.round(sidebar.getBoundingClientRect().width) : 0,
          labels: Boolean(label && getComputedStyle(label).display !== 'none'),
          menu: Boolean(menu && getComputedStyle(menu).display !== 'none'),
        };
      })()`);
      const phone = width <= 767;
      const tablet = width >= 768 && width < 1280;
      const navigationOk = phone
        ? chrome.nav && chrome.menu && chrome.sidebar > 0
        : tablet
          ? chrome.sidebar >= 60 && chrome.sidebar <= 110 && !chrome.labels
          : chrome.sidebar >= 200 && chrome.labels;
      record(
        `W ${width}px ${route}`,
        over === 0 && navigationOk,
        `overflow=${over} nav=${chrome.nav} sidebar=${chrome.sidebar} labels=${chrome.labels} menu=${chrome.menu}`,
      );
    }
  }
} catch (error) {
  record('RUN ABORTED', false, error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error));
} finally {
  const consoleErrors = session.consoleErrors.filter((text) => !text.includes('[midad]'));
  if (consoleErrors.length > 0) record('console errors', false, consoleErrors.slice(0, 3).join(' | '));
  await browser.stop();
  await server.close();
}

const failed = results.filter((entry) => !entry.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.error(`FAILED: ${failed.map((entry) => entry.name).join(', ')}`);
  process.exit(1);
}
