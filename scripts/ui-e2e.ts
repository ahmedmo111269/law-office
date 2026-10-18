/**
 * End-to-end UI → IndexedDB tests in a real Chromium.
 *
 *   npm run test:ui
 *
 * Every test drives the shipped bundle (the same `dist/` that is published),
 * then verifies the row in IndexedDB directly — not just that the UI updated.
 * Requires `npm run build:web` (the script builds it automatically).
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { goto, launchBrowser, prepareChromium, serveDirectory, type CdpSession } from './cdp.ts';

const ROOT = process.cwd();
const PROFILE = join(tmpdir(), 'lawo-e2e-profile');
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

function record(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name: string, condition: unknown, detail = ''): void {
  record(name, Boolean(condition), detail);
  if (!condition) throw new Error(`assertion failed: ${name}`);
}

// ---------------------------------------------------------------- helpers
async function js<T>(session: CdpSession, expression: string): Promise<T> {
  return session.evaluate<T>(expression);
}

async function click(session: CdpSession, selector: string): Promise<void> {
  const found = await js<boolean>(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!found) throw new Error(`cannot click ${selector}`);
  await delay(120);
}

async function clickByText(session: CdpSession, selector: string, text: string): Promise<void> {
  const found = await js<boolean>(session, `(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((node) => (node.textContent || '').trim().includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  if (!found) throw new Error(`cannot click ${selector} with text ${text}`);
  await delay(150);
}

async function fill(session: CdpSession, selector: string, value: string): Promise<void> {
  const ok = await js<boolean>(session, `(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  if (!ok) throw new Error(`cannot fill ${selector}`);
  await delay(80);
}

async function waitFor(session: CdpSession, expression: string, label: string, timeout = 15_000): Promise<void> {
  const started = Date.now();
  for (;;) {
    try {
      if (await js<boolean>(session, `Boolean(${expression})`)) return;
    } catch {
      // Navigation can destroy the execution context mid-poll; retry.
    }
    if (Date.now() - started > timeout) throw new Error(`timeout: ${label}`);
    await delay(150);
  }
}

/** Reads rows straight from the app's IndexedDB stores. */
function readStore<T = Record<string, unknown>>(session: CdpSession, store: string, limit = 50): Promise<T[]> {
  return js<T[]>(session, `(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('law-office');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!db.objectStoreNames.contains(${JSON.stringify(store)})) return [];
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(${JSON.stringify(store)}, 'readonly');
      const request = tx.objectStore(${JSON.stringify(store)}).getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.filter((row) => row && row.deleted_at === null).slice(0, ${limit});
  })()`);
}

function deviceSetting(session: CdpSession, key: string): Promise<string | null> {
  return js<string | null>(session, `(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('law-office');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction('device_setting', 'readonly');
      const request = tx.objectStore('device_setting').getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const row = rows.find((entry) => entry.key === ${JSON.stringify(key)});
    return row ? String(row.value) : null;
  })()`);
}

// ------------------------------------------------------------------- setup
execFileSync('node', ['--disable-warning=ExperimentalWarning', join(ROOT, 'scripts', 'build-web.ts')], { stdio: 'inherit' });
const executable = await prepareChromium();
const server = await serveDirectory(join(ROOT, 'dist'));
const browser = await launchBrowser(executable, PROFILE);
const session = browser.session;

try {
  // 01 — boot
  await goto(session, server.url);
  await waitFor(session, '(document.body && document.body.classList.contains("app-ready"))', 'app ready', 45_000);
  assert('01 التطبيق يبدأ من dist ويعرض الهيكل دون أخطاء', await js<boolean>(session, 'Boolean(document.querySelector(".app-shell")) && document.querySelectorAll(".nav-link").length === 17'), `${await js<number>(session, 'document.querySelectorAll(".nav-link").length')} links`);
  const bootErrors = session.pageErrors.length;
  assert('02 لا استثناءات JavaScript عند البدء', bootErrors === 0, session.pageErrors.join(' | '));

  // 03 — create a client through the real form
  await goto(session, `${server.url}#/clients`);
  await waitFor(session, 'Boolean(document.querySelector(".page-title"))', 'clients page');
  await clickByText(session, 'button', 'عميل جديد');
  await waitFor(session, 'Boolean(document.querySelector(".dialog"))', 'client dialog');
  await fill(session, '.dialog [name="firstName"]', 'أحمد');
  await fill(session, '.dialog [name="lastName"]', 'محمود');
  await fill(session, '.dialog [name="phone"]', '01012345678');
  await js<boolean>(session, `(() => { document.querySelector('.dialog form').requestSubmit(); return true; })()`);
  await waitFor(session, '!document.querySelector(".dialog")', 'client dialog closed', 20_000);
  const parties = await readStore(session, 'party');
  const client = parties.find((row) => String(row.display_name).includes('أحمد'));
  assert('03 إنشاء عميل من الواجهة يكتب صفًا في IndexedDB', Boolean(client), `party rows: ${parties.length}`);
  assert('04 بيانات الاتصال حُفظت في party_contact', (await readStore(session, 'party_contact')).some((row) => String(row.value) === '01012345678'));

  // 05 — file creation with generated number
  await goto(session, `${server.url}#/files`);
  await waitFor(session, 'Boolean(document.querySelector(".data-table, .empty-state"))', 'files page');
  await clickByText(session, 'button', 'ملف جديد');
  await waitFor(session, 'Boolean(document.querySelector(".dialog"))', 'file dialog');
  await fill(session, '.dialog [name="title"]', 'نزاع تعاقدي — شركة النيل');
  await js<boolean>(session, `(() => { document.querySelector('.dialog form').requestSubmit(); return true; })()`);
  await waitFor(session, '!document.querySelector(".dialog")', 'file dialog closed', 20_000);
  const files = await readStore(session, 'case_file');
  const createdFile = files.find((row) => String(row.title).includes('النيل'));
  assert('05 إنشاء ملف من الواجهة يحفظه ويرقّمه تلقائيًا', Boolean(createdFile) && String(createdFile?.file_number).startsWith('FILE-'), String(createdFile?.file_number ?? 'missing'));

  // 06 — the table shows the row after reload (DB → UI)
  await session.send('Page.reload');
  await waitFor(session, '(document.body && document.body.classList.contains("app-ready")) && document.querySelectorAll(".data-table tbody tr").length >= 1', 'file row rendered', 25_000);
  assert('06 الملف يظهر في الجدول بعد إعادة التحميل من قاعدة البيانات', await js<boolean>(session, `document.body.textContent.includes('شركة النيل')`));

  // 07 — create a task
  await goto(session, `${server.url}#/tasks`);
  await waitFor(session, 'Boolean(document.querySelector(".page-title"))', 'tasks page');
  await clickByText(session, 'button', 'مهمة جديدة');
  await waitFor(session, 'Boolean(document.querySelector(".dialog"))', 'task dialog');
  await fill(session, '.dialog [name="title"]', 'مراجعة مذكرة الدفاع');
  await js<boolean>(session, `(() => { document.querySelector('.dialog form').requestSubmit(); return true; })()`);
  await waitFor(session, '!document.querySelector(".dialog")', 'task dialog closed', 20_000);
  const tasks = await readStore(session, 'task');
  const task = tasks.find((row) => String(row.title).includes('مذكرة الدفاع'));
  assert('07 إنشاء مهمة من الواجهة يحفظها في قاعدة البيانات', Boolean(task));

  // 08 — the created task appears without a reload, then completion writes status + history
  await waitFor(session, `document.querySelectorAll('.data-table tbody tr[data-row-id]').length >= 1`, 'task row rendered', 15_000);
  const clicked = await js<boolean>(session, `(() => {
    const row = [...document.querySelectorAll('.data-table tbody tr[data-row-id]')].find((tr) => tr.textContent.includes('مذكرة الدفاع'));
    const button = row?.querySelector('button[aria-label^="إنجاز"]');
    if (!button) return false;
    button.click();
    return true;
  })()`);
  let doneTask = (await readStore(session, 'task')).find((row) => String(row.title).includes('مذكرة الدفاع'));
  for (let attempt = 0; attempt < 40 && !doneTask?.completed_at; attempt += 1) {
    await delay(150);
    doneTask = (await readStore(session, 'task')).find((row) => String(row.title).includes('مذكرة الدفاع'));
  }
  const history = (await readStore(session, 'task_status_history')).filter((row) => row.task_id === doneTask?.id);
  const taskDetail = JSON.stringify({
    clicked,
    status: doneTask?.status_id ?? null,
    completed: doneTask?.completed_at ?? null,
    history: history.length,
    rows: await js<string>(session, `[...document.querySelectorAll('.data-table tbody tr[data-row-id]')].map((tr) => (tr.textContent || '').slice(0, 40))`),
  });
  assert('08 إنشاء المهمة يحدّث الجدول وإتمامها يكتب الحالة والسجل', clicked === true && Boolean(doneTask?.completed_at) && history.length >= 1, taskDetail.slice(0, 400));

  // 09 — finance charge written from UI
  await goto(session, `${server.url}#/finance?tab=charges`);
  await waitFor(session, 'Boolean(document.querySelector(".data-table"))', 'charges table');
  await clickByText(session, 'button', 'مستحق جديد');
  await waitFor(session, 'Boolean(document.querySelector(".dialog"))', 'charge dialog');
  await js<boolean>(session, `(() => { document.querySelector('.dialog .picker input').focus(); return true; })()`);
  await fill(session, '.dialog .picker input', 'أحمد');
  await waitFor(session, 'document.querySelectorAll(".dialog .picker__option").length > 0', 'client picker options');
  await clickByText(session, '.dialog .picker__option', 'أحمد');
  await fill(session, '.dialog [name="description"]', 'أتعاب المرافعة');
  await fill(session, '.dialog [name="amount"]', '2500');
  await js<boolean>(session, `(() => { document.querySelector('.dialog form').requestSubmit(); return true; })()`);
  await waitFor(session, '!document.querySelector(".dialog")', 'charge dialog closed', 20_000);
  const charges = await readStore(session, 'financial_charge');
  const charge = charges.find((row) => String(row.description).includes('المرافعة'));
  assert('09 تسجيل مستحق مالي من الواجهة يحفظ المبلغ بالقروش', charge && Number(charge.amount_minor) === 250000, `rows ${charges.length}`);

  // 10 — theme toggle persists in device_setting
  await js<boolean>(session, `(() => { document.querySelector('.topbar-actions .icon-btn[title]')?.click(); return true; })()`);
  await delay(300);
  const theme = await deviceSetting(session, 'ui.theme');
  const themeAttr = await js<string>(session, 'document.documentElement.dataset.theme');
  assert('10 تبديل الوضع الداكن يُحفظ في device_setting ويُطبّق فورًا', Boolean(theme) && ['light', 'dark'].includes(themeAttr), `${theme} → ${themeAttr}`);

  // 11 — column preference persists across reload
  await goto(session, `${server.url}#/files`);
  await waitFor(session, 'Boolean(document.querySelector(".data-table"))', 'files table');
  await click(session, '.table-toolbar [aria-label="إعداد الأعمدة"]');
  await waitFor(session, 'Boolean(document.body.querySelector("[role=dialog][aria-label*=أعمدة]"))', 'columns panel');
  await js<boolean>(session, `(() => {
    const panel = document.querySelector('[role=dialog][aria-label*="أعمدة"]');
    const row = [...panel.querySelectorAll('.column-row')].find((node) => node.textContent.includes('الحالة'));
    const box = row?.querySelector('input[type="checkbox"]');
    if (!box) return false; box.click(); return true;
  })()`);
  const applied = await js<boolean>(session, `(() => {
    const panel = document.querySelector('[role=dialog][aria-label*="أعمدة"]');
    const button = [...panel.querySelectorAll('button')].find((node) => node.textContent.trim() === 'تطبيق');
    if (!button) return false; button.click(); return true;
  })()`);
  await delay(700);
  const savedTable = await deviceSetting(session, 'ui.table.files');
  const tableState = savedTable ? JSON.parse(savedTable) as { hidden?: string[] } : null;
  assert('11 إخفاء عمود يُحفظ في تفضيلات الجدول لهذا الجهاز', applied && Boolean(tableState && (tableState.hidden ?? []).includes('status')), savedTable?.slice(0, 120) ?? 'none');
  await session.send('Page.reload');
  await waitFor(session, 'Boolean(document.querySelector(".data-table"))', 'files table after reload');
  const hiddenAfterReload = await js<boolean>(session, `![...document.querySelectorAll('.data-table thead th')].some((th) => th.textContent.includes('الحالة'))`);
  assert('11b العمود المخفي يبقى مخفيًا بعد إعادة التحميل', hiddenAfterReload);

  // 12 — office settings write to the real table
  await goto(session, `${server.url}#/settings?tab=office`);
  await waitFor(session, 'Boolean(document.querySelector(".settings-form"))', 'settings form');
  await fill(session, '.settings-form [name="name"]', 'مكتب العدالة للمحاماة');
  await clickByText(session, 'button', 'حفظ بيانات المكتب');
  await delay(900);
  const profiles = await readStore(session, 'office_profile');
  assert('12 حفظ بيانات المكتب يحدّث office_profile', profiles.some((row) => String(row.name) === 'مكتب العدالة للمحاماة'), String(profiles[0]?.name ?? ''));
  assert('13 اسم المكتب يظهر فورًا في الشريط الجانبي', await js<boolean>(session, `document.querySelector('.sidebar-office__name')?.textContent.includes('العدالة')`));

  // 14 — global search finds the client through the search index
  await goto(session, `${server.url}#/today`);
  await waitFor(session, 'Boolean(document.querySelector(".search-trigger"))', 'search trigger');
  await js<boolean>(session, `(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); return true; })()`);
  await waitFor(session, 'Boolean(document.querySelector(".search-overlay input"))', 'search overlay');
  await fill(session, '.search-overlay input', 'أحمد');
  await waitFor(session, 'document.querySelectorAll(".search-result").length > 0', 'search results');
  assert('14 البحث الشامل يجد العميل من فهرس البحث المحلي', await js<boolean>(session, `document.querySelector('.search-overlay').textContent.includes('أحمد')`));
  await js<boolean>(session, `(() => { document.querySelector('.search-overlay').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`);
  await waitFor(session, '!document.querySelector(".search-overlay")', 'search closed');

  // 15 — delete (soft) then restore from archive
  await goto(session, `${server.url}#/tasks`);
  await waitFor(session, 'Boolean(document.querySelector(".data-table"))', 'tasks table');
  await js<boolean>(session, `(() => {
    const row = [...document.querySelectorAll('.data-table tbody tr')].find((tr) => tr.textContent.includes('مذكرة الدفاع'));
    const button = row?.querySelector('[aria-label*="حذف"]');
    if (!button) return false; button.click(); return true;
  })()`);
  await waitFor(session, 'Boolean(document.querySelector(".dialog"))', 'delete confirm');
  await clickByText(session, '.dialog button', 'حذف');
  await delay(900);
  const deletedTask = (await js<Array<Record<string, unknown>>>(session, `(async () => {
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('law-office'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise((resolve, reject) => { const tx = db.transaction('task', 'readonly'); const r = tx.objectStore('task').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close(); return rows;
  })()`)).find((row) => String(row.title).includes('مذكرة الدفاع'));
  assert('15 حذف المهمة حذف ناعم يحتفظ بالصف ويضع deleted_at', deletedTask && deletedTask.deleted_at !== null);

  await goto(session, `${server.url}#/archive?type=task`);
  await waitFor(session, 'Boolean(document.querySelector(".archive-row"))', 'archive rows');
  await clickByText(session, 'button', 'استعادة');
  await waitFor(session, 'Boolean(document.querySelector(".dialog"))', 'restore dialog');
  await clickByText(session, '.dialog button', 'استعادة');
  await delay(1200);
  const restored = (await readStore(session, 'task')).find((row) => String(row.title).includes('مذكرة الدفاع'));
  assert('16 الاستعادة من الأرشيف ترجع الصف للحالة النشطة', Boolean(restored));

  // 17 — responsive layout without horizontal overflow
  for (const [width, height] of [[320, 720], [768, 900], [1440, 900]] as const) {
    await session.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    for (const route of ['/today', '/files', '/finance', '/settings']) {
      await goto(session, `${server.url}#${route}`);
      await waitFor(session, '(document.body && document.body.classList.contains("app-ready"))', `ready ${route}`);
      await delay(260);
      const overflow = await js<number>(session, 'document.documentElement.scrollWidth - document.documentElement.clientWidth');
      assert(`17 العرض ${width}px بدون تمرير أفقي — ${route}`, overflow <= 1, `overflow ${overflow}`);
    }
  }
  await session.send('Emulation.clearDeviceMetricsOverride');

  // 18 — accessible names and focus ring
  const a11y = await js<{ unlabelled: number; focusRing: string }>(session, `(() => {
    const interactive = [...document.querySelectorAll('button, a[href], input, select, textarea')]
      .filter((el) => el.offsetParent !== null);
    const unlabelled = interactive.filter((el) => {
      const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').trim();
      const id = el.getAttribute('id');
      const linked = id ? document.querySelector('label[for="' + id + '"]') : null;
      return !label && !linked && !el.getAttribute('aria-labelledby');
    }).length;
    const button = document.querySelector('.btn--primary');
    if (button) button.focus();
    const style = button ? getComputedStyle(button) : null;
    return { unlabelled, focusRing: style ? style.outlineStyle : 'none' };
  })()`);
  assert('18 كل عنصر تفاعلي له اسم وصول', a11y.unlabelled === 0, `${a11y.unlabelled} unlabelled`);

  // 19 — offline reload still boots and keeps data
  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await delay(700);
  await session.send('Page.reload');
  await delay(2500);
  const offlineBoot = await js<boolean>(session, '(document.body && document.body.classList.contains("app-ready"))');
  const offlineRows = offlineBoot ? (await readStore(session, 'party')).length : 0;
  assert('19 إعادة التحميل دون شبكة تعمل من Service Worker والبيانات سليمة', offlineBoot && offlineRows >= 1, `rows ${offlineRows}`);
  await session.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

  // 20 — no external network requests during the whole run
  const external = await js<string[]>(session, `performance.getEntriesByType('resource').map((e) => e.name).filter((name) => !name.startsWith(location.origin) && !name.startsWith('data:') && !name.startsWith('blob:'))`);
  assert('20 لا طلبات شبكة خارجية إطلاقًا', external.length === 0, external.slice(0, 3).join(', '));
} catch (error) {
  record('RUN ABORTED', false, error instanceof Error ? error.message : String(error));
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
