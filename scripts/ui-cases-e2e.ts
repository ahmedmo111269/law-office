/** Real shipped UI → Chromium IndexedDB, case-intake/procedure/configuration regression. Disposable synthetic data only. */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import {
  goto,
  launchBrowser,
  prepareChromium,
  serveDirectory,
  type CdpSession,
} from './cdp.ts';
const results: Array<{ name: string; ok: boolean; detail: unknown }> = [];
let s: CdpSession;
const TOP = `([...document.querySelectorAll('.dialog-backdrop.is-open')].at(-1)||document)`;
async function check(name: string, condition: unknown, detail: unknown = '') {
  const ok = Boolean(condition);
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${JSON.stringify(detail)}`);
  if (!ok) throw new Error(name);
}
async function wait(expression: string, name: string) {
  return s.waitFor(expression, name, 30_000);
}
async function click(text: string, selector = 'button', global = false) {
  const ok = await s.evaluate(
    `(()=>{const root=${global ? 'document' : TOP};const el=[...root.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim().includes(${JSON.stringify(text)}));if(!el)return false;for(let p=el.parentElement;p;p=p.parentElement)if(p instanceof HTMLDetailsElement)p.open=true;el.scrollIntoView({block:'center'});el.focus();el.click();return true;})()`,
  );
  if (!ok) throw new Error(`missing control ${text}`);
  await delay(170);
}
async function fill(name: string, value: string) {
  await s.evaluate(
    `(()=>{const el=${TOP}.querySelector('[name="${name}"]');if(!el)throw new Error('missing ${name}');for(let p=el.parentElement;p;p=p.parentElement)if(p instanceof HTMLDetailsElement)p.open=true;el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));})()`,
  );
  await delay(120);
}
async function submit() {
  await s.evaluate(`${TOP}.querySelector('form').requestSubmit()`);
  await delay(240);
}
async function closed() {
  await wait(
    `!document.querySelector('.dialog-backdrop.is-open')`,
    'dialog closes',
  );
  await delay(180);
}
async function escape() {
  await s.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
  });
  await s.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    code: 'Escape',
  });
  await delay(200);
}
async function rows(table: string): Promise<Record<string, unknown>[]> {
  return s.evaluate(
    `(async()=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('law-office');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const data=await new Promise((resolve,reject)=>{const r=db.transaction(${JSON.stringify(table)}).objectStore(${JSON.stringify(table)}).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return data.filter(r=>!('deleted_at'in r)||r.deleted_at===null);})()`,
  );
}
async function route(path: string) {
  await s.evaluate(`location.hash=${JSON.stringify('#' + path)}`);
  await delay(280);
  await wait(
    `document.body?.classList.contains('app-ready')&&!document.querySelector('.page-loading')&&document.querySelector('.page-title')`,
    'page',
  );
}
async function selectPicker(name: string, text: string) {
  await s.evaluate(
    `(()=>{const el=${TOP}.querySelector('[data-field="${name}"] .picker__input');for(let p=el;p;p=p.parentElement)if(p instanceof HTMLDetailsElement)p.open=true;el.focus();el.value=${JSON.stringify(text)};el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
  );
  await wait(
    `${TOP}.querySelector('[data-field="${name}"] [role="option"]')`,
    'picker result',
  );
  await s.evaluate(
    `${TOP}.querySelector('[data-field="${name}"] [role="option"]').click()`,
  );
  await delay(100);
}
async function noOverflow(name: string) {
  const data = await s.evaluate<{
    body: number;
    view: number;
    dialog: number;
    content: number;
  }>(
    `(()=>{const d=document.querySelector('.dialog-backdrop.is-open .dialog');const c=d?.querySelector('.dialog__content');return{body:document.documentElement.scrollWidth,view:innerWidth,dialog:d?d.scrollWidth-d.clientWidth:0,content:c?c.scrollWidth-c.clientWidth:0};})()`,
  );
  await check(
    name,
    data.body <= data.view + 2 && data.dialog <= 2 && data.content <= 2,
    data,
  );
}
execFileSync(
  'node',
  ['--disable-warning=ExperimentalWarning', 'scripts/build-web.ts'],
  { stdio: 'inherit' },
);
const server = await serveDirectory(join(process.cwd(), 'dist'));
const browser = await launchBrowser(
  await prepareChromium(),
  join(tmpdir(), 'midad-cases-ui-e2e'),
);
s = browser.session;
try {
  await goto(s, server.url);
  await wait(`document.body?.classList.contains('app-ready')`, 'boot');
  await route('/clients');
  await click('عميل جديد');
  await fill('firstName', 'شخص');
  await fill('lastName', 'اختباري');
  await submit();
  await closed();
  await route('/cases');
  await click('قضية / ملف جديد');
  await wait(`document.querySelector('.case-intake')`, 'intake');
  await fill('caseTypeCode', 'family');
  await wait(
    `document.querySelector('[name="special_children_relevant"]')`,
    'family template',
  );
  await check(
    'conditional child data starts hidden',
    await s.evaluate(
      `document.querySelector('[name="special_children_notes"]').closest('.field').hidden`,
    ),
  );
  await fill('title', 'ملف واجهة اصطناعي للأسرة');
  await fill('subject', 'نزاع اصطناعي لا بيانات عملاء');
  await fill('special_children_relevant', 'yes');
  await fill('special_children_notes', 'PRIVATECHILDREN_SENTINEL');
  await check(
    'conditional child data becomes visible',
    await s.evaluate(
      `!document.querySelector('[name="special_children_notes"]').closest('.field').hidden`,
    ),
  );
  await selectPicker('partyId', 'اختباري');
  await click('إضافة هذا الطرف للقائمة');
  await fill('initialStageType', 'family_settlement');
  await fill('initialReference', 'طلب-17');
  await fill('initialStartedOn', '2026-09-01');
  await submit();
  await closed();
  let files = await rows('case_file');
  const file = files.find((r) => r.title === 'ملف واجهة اصطناعي للأسرة')!;
  const fid = String(file.id);
  await check(
    'partial intake has a real office file and no invented judicial case',
    Boolean(file) && (await rows('legal_case')).length === 0,
    file.file_number,
  );
  await check(
    'private child values persist but are excluded from every general search document',
    (await rows('search_document')).length > 0 &&
      (await rows('search_document')).every(
        (r) => !String(r.normalized_text).includes('privatechildren_sentinel'),
      ) &&
      String(file.specialized_json).includes('PRIVATECHILDREN_SENTINEL'),
  );
  const originalPartyLinkId = (await rows('case_file_party'))[0]?.id;
  await check(
    'optional independent family stage survives creation',
    (await rows('procedural_stage')).length === 1,
  );
  await route(`/files/${fid}?tab=procedure`);
  await click('استكمال / تعديل البيانات');
  await wait(`document.querySelector('.case-intake')`, 'edit');
  await click('تعديل العلاقة');
  await fill('roleCode', 'defendant');
  await fill('sideCode', 'defendant');
  await s.evaluate(
    `${TOP}.querySelector('[name="represented"]').checked=false`,
  );
  await submit();
  await delay(180);
  await check(
    'relationship edit remains a draft until the parent intake is saved',
    (await rows('case_file_party'))[0]?.is_office_client === 1,
  );
  await submit();
  await closed();
  const links = await rows('case_file_party');
  await check(
    'saved relationship keeps its ID, correct side and independent representation',
    links.length === 1 &&
      links[0]?.id === originalPartyLinkId &&
      links[0]?.is_office_client === 0 &&
      Boolean(links[0]?.side_id),
    links.map((r) => ({ id: r.id, client: r.is_office_client })),
  );
  await click('استكمال / تعديل البيانات');
  await wait(`document.querySelector('.case-intake')`, 'edit again');
  await fill('caseTypeCode', 'labor');
  await wait(
    `document.querySelectorAll('.dialog-backdrop.is-open').length===2`,
    'type confirmation',
  );
  await click('تغيير النوع مع الاحتفاظ');
  await wait(
    `document.querySelector('[name="special_employer"]')`,
    'labor fields',
  );
  await fill('special_employer', 'منشأة اصطناعية');
  await fill('caseTypeCode', 'family');
  await click('تغيير النوع مع الاحتفاظ');
  await wait(
    `document.querySelector('[name="special_children_notes"]')`,
    'family back',
  );
  await check(
    'switching type and back retains hidden family values',
    await s.evaluate(
      `document.querySelector('[name="special_children_notes"]').value==='PRIVATECHILDREN_SENTINEL'`,
    ),
  );
  await click('تخصيص الأقسام');
  await wait(
    `document.querySelectorAll('.dialog-backdrop.is-open').length===2`,
    'customizer',
  );
  await check(
    'fundamental fields cannot be hidden by customization',
    await s.evaluate(
      `${TOP}.querySelector('[name="visible_basic"]').disabled&&!${TOP}.querySelector('[name="field_title"],[name="field_subject"],[name="field_caseTypeCode"]')`,
    ),
  );
  await escape();
  await check(
    'Escape closes only the top nested dialog and preserves the unsaved form',
    await s.evaluate(
      `document.querySelectorAll('.dialog-backdrop.is-open').length===1&&Boolean(document.querySelector('.case-intake'))`,
    ),
  );
  await submit();
  await closed();
  files = await rows('case_file');
  await check(
    'hidden labor namespace is retained after saving family again',
    String(files.find((r) => r.id === fid)?.specialized_json).includes(
      'منشأة اصطناعية',
    ),
  );

  await click('تسجيل مرحلة');
  await wait(`document.querySelector('[name="typeCode"]')`, 'stage form');
  await fill('typeCode', 'other');
  await submit();
  await check(
    'manual stage requires its actual description, with focusable field error',
    await s.evaluate(
      `Boolean(document.querySelector('[name="customType"][aria-invalid="true"]'))`,
    ),
  );
  await fill('customType', 'إجراء مكتبي موثق');
  await fill('referenceNumber', 'طلب-18');
  await fill('startedOn', '2026-09-10');
  await fill('completedOn', '2026-09-11');
  await fill('statusCode', 'ended');
  await fill('dataSource', 'ورقة اصطناعية للاختبار');
  await submit();
  await closed();
  await check(
    'closing a stage creates no automatic judicial case',
    (await rows('legal_case')).length === 0 &&
      (await rows('procedural_stage')).length === 2,
  );
  await click('متابعة المرحلة');
  await click('إنشاء مهمة مرتبطة', 'button', true);
  await wait(`document.querySelector('[name="title"]')`, 'task');
  await fill('title', 'مهمة مرحلة اصطناعية');
  await submit();
  await closed();
  const task = (await rows('task')).find(
    (r) => r.title === 'مهمة مرحلة اصطناعية',
  );
  await check(
    'existing task dialog persists stage and initializes the file picker',
    task?.file_id === fid && Boolean(task?.stage_id),
    task?.stage_id,
  );
  await click('متابعة المرحلة');
  await click('إنشاء موعد متابعة', 'button', true);
  await wait(`document.querySelector('[name="date"]')`, 'appointment');
  await fill('title', 'موعد مرحلة اصطناعي');
  await submit();
  await closed();
  const appointment = (await rows('appointment')).find(
    (r) => r.title === 'موعد مرحلة اصطناعي',
  );
  await check(
    'existing appointment dialog persists its stage/file context',
    appointment?.file_id === fid && Boolean(appointment?.stage_id),
    appointment?.stage_id,
  );
  await click('متابعة المرحلة');
  await click('عرض أعمال ومواعيد المرحلة', 'button', true);
  await wait(
    `document.querySelector('.dialog')?.textContent.includes('مهمة مرحلة اصطناعية')`,
    'stage work',
  );
  await check(
    'stage follow-up tables read saved work',
    await s.evaluate(
      `document.querySelector('.dialog').textContent.includes('موعد مرحلة اصطناعي')`,
    ),
  );
  await escape();
  await click('إنشاء دعوى مرتبطة');
  await wait(`document.querySelector('.case-intake')`, 'judicial registration');
  await submit();
  await check(
    'explicit court registration rejects an empty real case number',
    await s.evaluate(
      `Boolean(document.querySelector('[name="caseNumber"][aria-invalid="true"]'))`,
    ),
  );
  await fill('caseNumber', '١٢٣');
  await fill('caseYear', '٢٠٢٦');
  await fill('litigationDegreeCode', 'first_instance');
  await submit();
  await closed();
  const cases = await rows('legal_case');
  const cid = String(cases[0]?.id);
  await check(
    'stage-to-court action preserves office file and stage identifiers',
    cases.length === 1 &&
      (await rows('case_file')).length === 1 &&
      (await rows('procedural_stage')).some((r) => r.case_id === cid),
    cases.map((r) => ({ number: r.case_number, year: r.case_year })),
  );
  await click('إضافة درجة / دعوى مرتبطة');
  await wait(`document.querySelector('.case-intake')`, 'related degree');
  await fill('caseNumber', '٤٥٦');
  await fill('caseYear', '٢٠٢٦');
  await fill('relationCode', 'appeal_of');
  await fill('litigationDegreeCode', 'appeal');
  await submit();
  await closed();
  await check(
    'independent related degree retains both numbers and manual relationship',
    (await rows('legal_case')).length === 2 &&
      (await rows('legal_case_link')).length === 1 &&
      (await rows('case_file')).length === 1,
  );
  await route('/settings?tab=cases');
  await click('إدارة القالب المختار');
  await wait(`document.querySelector('[name="template"]')`, 'template editor');
  await fill('label_relationship', 'مسمى حقل معدّل اصطناعي');
  await submit();
  await closed();
  await check(
    'template configuration saves a new office-level version',
    (await rows('office_setting')).some(
      (r) =>
        r.key === 'cases.template.civil' &&
        String(r.value).includes('مسمى حقل معدّل اصطناعي'),
    ),
  );

  const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440];
  for (const [index, width] of widths.entries()) {
    await s.send('Emulation.setDeviceMetricsOverride', {
      width,
      height: width < 500 ? 820 : 1000,
      deviceScaleFactor: 1,
      mobile: width < 500,
    });
    await route('/cases');
    await noOverflow(`case list width ${width}`);
    await click('قضية / ملف جديد');
    await wait(`document.querySelector('.case-intake')`, 'responsive intake');
    await fill(
      'caseTypeCode',
      [
        'civil',
        'labor',
        'family',
        'criminal',
        'administrative',
        'commercial',
        'economic',
        'execution',
      ][index]!,
    );
    await s.evaluate(
      `document.querySelectorAll('.case-intake details').forEach(d=>d.open=true)`,
    );
    await delay(120);
    await noOverflow(`expanded intake width ${width}`);
    // Label association and real keyboard focus/trapping, including hidden controls.
    await check(
      `label associations width ${width}`,
      await s.evaluate(
        `(()=>{const root=document.querySelector('.case-intake');return [...root.querySelectorAll('input:not([type="hidden"]),select,textarea')].every(e=>Boolean(e.getAttribute('aria-label')||root.querySelector('label[for="'+e.id+'"]')));})()`,
      ),
    );
    await s.evaluate(
      `(()=>{const panel=document.querySelector('.dialog');const focusable=[...panel.querySelectorAll('button,input:not([type="hidden"]),select,textarea,a[href]')].filter(e=>e.getClientRects().length&&!e.disabled);focusable.at(-1).focus();})()`,
    );
    await s.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    await s.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Tab',
      code: 'Tab',
      windowsVirtualKeyCode: 9,
    });
    await check(
      `keyboard Tab remains inside intake width ${width}`,
      await s.evaluate(`Boolean(document.activeElement?.closest('.dialog'))`),
    );
    await escape();
    await closed();
    await route(`/files/${fid}?tab=procedure`);
    await noOverflow(`procedural history width ${width}`);
    await click('تسجيل مرحلة');
    await wait(
      `document.querySelector('[name="typeCode"]')`,
      'responsive stage',
    );
    await noOverflow(`stage dialog width ${width}`);
    await escape();
    await route('/settings?tab=cases');
    await click('إدارة القالب المختار');
    await wait(
      `document.querySelector('[name="template"]')`,
      'responsive template',
    );
    await s.evaluate(
      `document.querySelectorAll('.dialog details').forEach(d=>d.open=true)`,
    );
    await noOverflow(`template editor width ${width}`);
    await escape();
  }
  await check(
    'layout customization is committed through existing device_setting',
    (await rows('device_setting')).some(
      (r) =>
        r.key === 'ui.caseForm.layout' &&
        Array.isArray(JSON.parse(String(r.value)).closed),
    ),
  );
  await s.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await route(`/files/${fid}?tab=procedure`);
  await wait(`navigator.serviceWorker.controller`, 'service worker control');
  const beforeOffline = {
    cases: (await rows('legal_case')).map((r) => r.id).sort(),
    stages: (await rows('procedural_stage')).map((r) => r.id).sort(),
  };
  await s.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await s.send('Page.reload');
  await wait(
    `document.body?.classList.contains('app-ready')&&document.body?.textContent?.includes('المراحل والإجراءات')`,
    'offline reload',
  );
  await check(
    'offline reload preserves both degrees, history and sensitive-value privacy',
    JSON.stringify((await rows('legal_case')).map((r) => r.id).sort()) ===
      JSON.stringify(beforeOffline.cases) &&
      JSON.stringify(
        (await rows('procedural_stage')).map((r) => r.id).sort(),
      ) === JSON.stringify(beforeOffline.stages) &&
      (await rows('search_document')).every(
        (r) => !String(r.normalized_text).includes('privatechildren_sentinel'),
      ),
  );
  await click('تسجيل مرحلة');
  await wait(`document.querySelector('[name="typeCode"]')`, 'offline stage');
  await fill('typeCode', 'other');
  await fill('customType', 'مرحلة محفوظة دون اتصال');
  await submit();
  await closed();
  await check(
    'offline writes use the real database and update history',
    (await rows('procedural_stage')).length === beforeOffline.stages.length + 1,
  );
  await check(
    'no external assets or services used',
    await s.evaluate(
      `performance.getEntriesByType('resource').every(e=>e.name.startsWith(location.origin)||e.name.startsWith('data:')||e.name.startsWith('blob:'))`,
    ),
  );
  await check('no browser exceptions', s.pageErrors.length === 0, s.pageErrors);
} catch (error) {
  console.error(error);
  results.push({ name: 'run aborted', ok: false, detail: String(error) });
  mkdirSync('.arena', { recursive: true });
  writeFileSync(
    '.arena/cases-ui-failure.html',
    await s.evaluate('document.documentElement.outerHTML'),
  );
  const screenshot = (await s.send('Page.captureScreenshot', {
    format: 'png',
  })) as { data: string };
  writeFileSync(
    '.arena/cases-ui-failure.png',
    Buffer.from(screenshot.data, 'base64'),
  );
} finally {
  await browser.stop();
  await server.close();
  mkdirSync('.arena', { recursive: true });
  writeFileSync(
    '.arena/cases-ui-results.json',
    JSON.stringify(results, null, 2),
  );
}
console.log(
  `${results.filter((r) => r.ok).length}/${results.length} case UI checks passed`,
);
if (results.some((r) => !r.ok)) process.exitCode = 1;
