import type { DatabaseAdapter } from '../adapter.ts';

export interface MigrationCapabilities {
  readonly fts5: boolean;
}

export interface MigrationContext {
  readonly now: string;
  readonly appVersion: string;
  readonly capabilities: MigrationCapabilities;
}

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly descriptionAr: string;
  /** SHA-256 of the frozen migration content, verified on every open. */
  readonly checksum: string;
  /**
   * Runs inside a single transaction opened by MigrationManager. A migration
   * must not start/commit transactions itself and must be idempotent only at
   * the level guaranteed by the manager (it runs at most once).
   */
  up(adapter: DatabaseAdapter, context: MigrationContext): void;
}

export interface MigrationResult {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly applied: ReadonlyArray<{ version: number; name: string; executionMs: number }>;
  readonly preMigrationBackupPath: string | null;
}
