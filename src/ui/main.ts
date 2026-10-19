import './tokens.css';
import './base.css';
import './components.css';
import './shell.css';

import { h } from './dom.ts';
import { icon } from './icons.ts';
import { APP_NAME, APP_VERSION, Workspace } from './state/workspace.ts';
import { createServices } from './services/index.ts';
import { Router, navigate, type RouteContext } from './app/router.ts';
import {
  attachOnlineListeners,
  createShell,
  syncShellForRoute,
  type AppShell,
} from './app/shell.ts';
import { navTitle } from './app/nav.ts';
import type { PageArgs } from './app/context.ts';
import type { Services } from './services/index.ts';
import { closeAllOverlays } from './overlays.ts';

interface AppRuntime {
  workspace: Workspace;
  services: Services;
  shell: AppShell;
  router: Router;
}

let runtime: AppRuntime | null = null;

const mount = document.getElementById('app');
if (!mount) throw new Error('APP_MOUNT_MISSING');

void boot();

async function boot(): Promise<void> {
  mount!.replaceChildren(splash());
  let workspace: Workspace;
  try {
    workspace = await Workspace.open((message) => {
      const status = mount!.querySelector('.boot-text');
      if (status) status.textContent = message;
    });
  } catch (error) {
    console.error('[midad] database open failed', error);
    mount!.replaceChildren(failureView(Workspace.openFailed(error)));
    return;
  }
  const services = createServices(workspace);
  const shell = createShell(workspace, services);
  mount!.replaceChildren(shell.root);
  document.documentElement.dataset.ready = 'true';
  document.body.classList.add('app-ready');
  attachOnlineListeners(shell);

  const router = new Router(shell.outlet, {
    onAfterRender: (path) => {
      closeAllOverlays();
      syncShellForRoute(shell, path, workspace);
      void workspace.preferences.set('ui.lastRoute', path);
    },
    onError: () => {
      shell.announce('تعذر فتح الصفحة');
    },
  });
  runtime = { workspace, services, shell, router };

  const page = (
    pattern: string,
    load: () => Promise<
      (context: PageArgs) => HTMLElement | Promise<HTMLElement>
    >,
    title?: (context: RouteContext) => string,
  ): void => {
    router.add({
      pattern,
      handler: async (context) => {
        const render = await load();
        return render(contextArgs(context));
      },
      title: title ?? ((context) => navTitle(context.path).title),
    });
  };

  // ------------------------------------------------------------- اليوم
  page(
    '/today',
    () => import('./pages/today.ts').then((module) => module.renderToday),
    () => 'مكتب اليوم',
  );
  page(
    '/tasks',
    () => import('./pages/tasks.ts').then((module) => module.renderTasks),
    () => 'المهام والأعمال',
  );
  page(
    '/appointments',
    () =>
      import('./pages/appointments.ts').then(
        (module) => module.renderAppointments,
      ),
    () => 'المواعيد',
  );

  // ---------------------------------------------------- العمل القانوني
  page(
    '/files',
    () => import('./pages/files.ts').then((module) => module.renderFiles),
    () => 'الملفات',
  );
  page(
    '/files/:id',
    () =>
      import('./pages/file-detail.ts').then(
        (module) => module.renderFileDetail,
      ),
    () => 'ملف',
  );
  page(
    '/cases',
    () => import('./pages/cases.ts').then((module) => module.renderCases),
    () => 'القضايا',
  );
  page(
    '/cases/:id',
    () => import('./pages/cases.ts').then((module) => module.renderCaseDetail),
    () => 'قضية',
  );
  page(
    '/hearings',
    () => import('./pages/hearings.ts').then((module) => module.renderHearings),
    () => 'الجلسات',
  );
  page(
    '/judgments',
    () =>
      import('./pages/judgments.ts').then((module) => module.renderJudgments),
    () => 'الأحكام',
  );
  page(
    '/judgments/:id',
    () =>
      import('./pages/judgments.ts').then(
        (module) => module.renderJudgmentDetail,
      ),
    () => 'حكم',
  );
  page(
    '/execution',
    () =>
      import('./pages/execution.ts').then((module) => module.renderExecution),
    () => 'أعمال التنفيذ',
  );
  page(
    '/execution/:id',
    () =>
      import('./pages/execution.ts').then(
        (module) => module.renderExecutionDetail,
      ),
    () => 'ملف تنفيذ',
  );
  page(
    '/announcements',
    () =>
      import('./pages/announcements.ts').then(
        (module) => module.renderAnnouncements,
      ),
    () => 'الإعلانات والإنابات',
  );

  // --------------------------------------------------- الأطراف والوثائق
  page(
    '/clients',
    () => import('./pages/clients.ts').then((module) => module.renderClients),
    () => 'العملاء',
  );
  page(
    '/clients/:id',
    () =>
      import('./pages/clients.ts').then((module) => module.renderClientDetail),
    () => 'ملف العميل',
  );
  page(
    '/parties',
    () => import('./pages/parties.ts').then((module) => module.renderParties),
    () => 'الأطراف والخصوم',
  );
  page(
    '/parties/:id',
    () =>
      import('./pages/parties.ts').then((module) => module.renderPartyDetail),
    () => 'طرف',
  );
  page(
    '/documents',
    () =>
      import('./pages/documents.ts').then((module) => module.renderDocuments),
    () => 'المستندات',
  );
  page(
    '/contracts',
    () =>
      import('./pages/contracts.ts').then((module) => module.renderContracts),
    () => 'العقود والتوكيلات',
  );

  // ------------------------------------------------------ إدارة المكتب
  page(
    '/finance',
    () => import('./pages/finance.ts').then((module) => module.renderFinance),
    () => 'المالية',
  );
  page(
    '/reports',
    () => import('./pages/reports.ts').then((module) => module.renderReports),
    () => 'التقارير',
  );
  page(
    '/archive',
    () => import('./pages/archive.ts').then((module) => module.renderArchive),
    () => 'الأرشيف',
  );
  page(
    '/settings',
    () => import('./pages/settings.ts').then((module) => module.renderSettings),
    () => 'الإعدادات',
  );
  page(
    '/search',
    () => import('./pages/search.ts').then((module) => module.renderSearch),
    () => 'البحث',
  );

  // ---------------------------------------------------------- start
  ensureInitialRoute(workspace);
  router.start();
  void shell.refreshNavigationCounts();
  window.setInterval(() => void shell.refreshNavigationCounts(), 120_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      void shell.refreshNavigationCounts();
  });
  registerServiceWorker();

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason instanceof Error && /ResizeObserver/.test(reason.message))
      return;
    console.error('[midad] unhandled rejection', reason);
  });
}

function contextArgs(context: RouteContext): PageArgs {
  if (!runtime) throw new Error('RUNTIME_NOT_READY');
  return {
    ...context,
    workspace: runtime.workspace,
    services: runtime.services,
    shell: runtime.shell,
  };
}

function ensureInitialRoute(workspace: Workspace): void {
  if (window.location.hash && window.location.hash !== '#') return;
  const startPage = workspace.preferences.get('ui.startPage') || 'today';
  const lastRoute = workspace.preferences.get('ui.lastRoute');
  const target =
    startPage === 'last' && lastRoute
      ? lastRoute
      : `/${startPage === 'last' ? 'today' : startPage}`;
  navigate(target.startsWith('/') ? target : `/${target}`, { replace: true });
}

function splash(): HTMLElement {
  return h(
    'div',
    { class: 'boot-screen', attrs: { role: 'status', 'aria-live': 'polite' } },
    h(
      'div',
      { class: 'boot-card' },
      h(
        'span',
        { class: 'brand__mark boot-mark', attrs: { 'aria-hidden': 'true' } },
        icon('scale', 26),
      ),
      h('h1', { class: 'boot-title', text: APP_NAME }),
      h('p', {
        class: 'boot-text',
        attrs: { 'aria-live': 'polite', role: 'status' },
        text: 'جارٍ فتح قاعدة البيانات المحلية…',
      }),
      h('span', { class: 'spinner', attrs: { 'aria-hidden': 'true' } }),
      h('p', {
        class: 'boot-note',
        text: 'لا يتم إرسال أي بيانات عبر الشبكة.',
      }),
    ),
  );
}

function failureView(message: string): HTMLElement {
  return h(
    'div',
    { class: 'boot-screen' },
    h(
      'div',
      { class: 'boot-card boot-card--wide', attrs: { role: 'alert' } },
      h(
        'span',
        { class: 'boot-error-icon', attrs: { 'aria-hidden': 'true' } },
        icon('alert', 26),
      ),
      h('h1', { class: 'boot-title', text: 'تعذر فتح البرنامج' }),
      h('p', { class: 'boot-text', text: message }),
      h(
        'div',
        { class: 'stack', style: 'gap:8px;text-align:start' },
        h('p', {
          class: 'text-sm text-2',
          text: 'جرّب الخطوات التالية بالترتيب:',
        }),
        h(
          'ol',
          { class: 'boot-steps' },
          h('li', { text: 'أعد تحميل الصفحة (Ctrl+R).' }),
          h('li', {
            text: 'تأكد من عدم فتح البرنامج في نافذة تصفح خاص (Incognito)؛ التخزين قد يُحجب.',
          }),
          h('li', {
            text: 'تأكد من السماح للموقع بتخزين البيانات، وأن مساحة القرص كافية.',
          }),
          h('li', {
            text: 'أغلق التبويبات الأخرى التي تفتح النسخة نفسها ثم أعد المحاولة.',
          }),
        ),
        h('p', {
          class: 'text-xs text-3',
          text: `النسخة ${APP_VERSION} · لا تحذف بيانات المتصفح قبل أخذ نسخة احتياطية من جهاز يعمل.`,
        }),
      ),
      h('button', {
        class: 'btn btn--primary',
        type: 'button',
        text: 'إعادة المحاولة',
        on: { click: () => window.location.reload() },
      }),
    ),
  );
}

function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  if (window.location.protocol === 'file:') return;
  // Bootstrap waits for the database, so `load` may already have fired by the
  // time we get here. Registering on a `load` that will never come again was
  // silently disabling offline support entirely.
  const register = (): void => {
    void navigator.serviceWorker
      .register(new URL('sw.js', document.baseURI).toString(), { scope: './' })
      .catch(() => {
        // Offline support is an enhancement; the app remains fully usable without it.
      });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
