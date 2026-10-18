import type { Workspace } from '../state/workspace.ts';
import type { Services } from '../services/index.ts';
import type { RouteContext } from './router.ts';
import type { AppShell } from './shell.ts';

export interface AppContext {
  readonly workspace: Workspace;
  readonly services: Services;
  readonly shell: AppShell;
}

export type PageArgs = AppContext & RouteContext;

export function navigateTo(path: string): void {
  window.location.hash = path.startsWith('#') ? path.slice(1) : path;
}
