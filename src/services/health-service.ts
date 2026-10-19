import { assertCaseIntegritySync } from '../cases/integrity.ts';
import type { EngineRow } from '../portable/store.ts';
import { PORTABLE_SCHEMA } from '../schema/current.ts';
import type { DatabaseAdapter, SqlRow } from '../db/adapter.ts';
import { AppError } from '../errors.ts';
import {
  REQUIRED_INDEXES_V1,
  REQUIRED_TABLES_V1,
  REQUIRED_TRIGGERS_V1,
} from '../schema/v1/manifest.ts';

export interface SchemaCheckReport {
  readonly ok: boolean;
  readonly schemaVersion: number;
  readonly applicationId: number;
  readonly integrity: string;
  readonly quickCheck: string;
  readonly foreignKeyViolations: ReadonlyArray<SqlRow>;
  readonly missingTables: readonly string[];
  readonly caseIntegrityViolations: readonly string[];
  readonly missingIndexes: readonly string[];
  readonly missingTriggers: readonly string[];
  readonly presentTables: number;
  readonly fts5Available: boolean;
  readonly ftsIndexPresent: boolean;
}

export interface DatabaseStats {
  readonly schemaVersion: number;
  readonly parties: number;
  readonly clients: number;
  readonly files: number;
  readonly cases: number;
  readonly hearings: number;
  readonly judgments: number;
  readonly tasks: number;
  readonly documents: number;
  readonly transactions: number;
  readonly auditEntries: number;
  readonly pendingSyncChanges: number;
  readonly openConflicts: number;
  readonly searchDocuments: number;
  readonly outboxFailed: number;
}

export class HealthService {
  private readonly db: DatabaseAdapter;

  constructor(db: DatabaseAdapter) {
    this.db = db;
  }

  schemaCheck(): SchemaCheckReport {
    const presentTables = this.names(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    );
    const presentIndexes = this.names(
      "SELECT name FROM sqlite_master WHERE type = 'index'",
    );
    const presentTriggers = this.names(
      "SELECT name FROM sqlite_master WHERE type = 'trigger'",
    );

    const version =
      this.db.get<{ user_version: number }>('PRAGMA user_version')
        ?.user_version ?? 0;
    const requiredTables =
      version >= 2
        ? PORTABLE_SCHEMA.tables.map((t) => t.name)
        : REQUIRED_TABLES_V1;
    const requiredIndexes =
      version >= 2
        ? PORTABLE_SCHEMA.tables
            .flatMap((t) => t.indexes.map((i) => i.name))
            .filter((n) => !n.startsWith('sqlite_autoindex'))
        : REQUIRED_INDEXES_V1;
    const missingTables = requiredTables.filter(
      (name) => !presentTables.has(name),
    );
    const missingIndexes = requiredIndexes.filter(
      (name) => !presentIndexes.has(name),
    );
    const missingTriggers = REQUIRED_TRIGGERS_V1.filter(
      (name) => !presentTriggers.has(name),
    );

    const integrityRows = this.db.query<{ integrity_check: string }>(
      'PRAGMA integrity_check',
    );
    const integrity = integrityRows
      .map((row) => row.integrity_check)
      .join('; ');
    const quickRows = this.db.query<{ quick_check: string }>(
      'PRAGMA quick_check',
    );
    const quickCheck = quickRows.map((row) => row.quick_check).join('; ');
    const foreignKeyViolations = this.db.query<SqlRow>(
      'PRAGMA foreign_key_check',
    );
    const schemaVersion =
      this.db.get<{ user_version: number }>('PRAGMA user_version')
        ?.user_version ?? 0;
    const applicationId =
      this.db.get<{ application_id: number }>('PRAGMA application_id')
        ?.application_id ?? 0;
    const ftsIndexPresent = presentTables.has('search_fts');

    const caseIntegrityViolations: string[] = [];
    if (version >= 2 && missingTables.length === 0) {
      for (const [table, predicate] of [
        ['lookup_item', 'parent_id IS NOT NULL'],
        ['court', 'parent_id IS NOT NULL'],
        ['case_file', 'subtype_id IS NOT NULL OR nature_id IS NOT NULL'],
        ['procedural_stage', '1=1'],
        ['legal_case_link', '1=1'],
        ['case_file_party', 'case_id IS NOT NULL'],
        ['case_term', 'case_id IS NOT NULL'],
        ['document_link', 'stage_id IS NOT NULL'],
        ['task', 'stage_id IS NOT NULL'],
        ['appointment', 'stage_id IS NOT NULL'],
        ['legal_case', 'circuit_id IS NOT NULL'],
        ['hearing', 'circuit_id IS NOT NULL'],
      ] as const) {
        for (const row of this.db.query<EngineRow>(
          `SELECT * FROM ${table} WHERE deleted_at IS NULL AND (${predicate})`,
        )) {
          try {
            assertCaseIntegritySync(this.db, table, row);
          } catch (error) {
            caseIntegrityViolations.push(
              `${table}:${String(row.id)}: ${(error as Error).message}`,
            );
          }
          if (caseIntegrityViolations.length >= 50) break;
        }
        if (caseIntegrityViolations.length >= 50) break;
      }
    }

    const ok =
      missingTables.length === 0 &&
      missingIndexes.length === 0 &&
      missingTriggers.length === 0 &&
      integrity === 'ok' &&
      foreignKeyViolations.length === 0 &&
      caseIntegrityViolations.length === 0;

    return {
      ok,
      schemaVersion,
      applicationId,
      integrity,
      quickCheck,
      foreignKeyViolations,
      caseIntegrityViolations,
      missingTables,
      missingIndexes,
      missingTriggers,
      presentTables: presentTables.size,
      fts5Available: this.detectFts5(),
      ftsIndexPresent,
    };
  }

  assertHealthy(): void {
    const report = this.schemaCheck();
    if (!report.ok) {
      throw new AppError('INVALID_STATE', 'database health check failed', {
        missingTables: report.missingTables,
        missingIndexes: report.missingIndexes,
        missingTriggers: report.missingTriggers,
        integrity: report.integrity,
        caseIntegrityViolations: report.caseIntegrityViolations,
        foreignKeyViolations: report.foreignKeyViolations,
      });
    }
  }

  quickCheck(): string {
    return this.db
      .query<{ quick_check: string }>('PRAGMA quick_check')
      .map((row) => row.quick_check)
      .join('; ');
  }

  stats(): DatabaseStats {
    const count = (table: string, where = ''): number =>
      this.db.get<{ c: number }>(
        `SELECT COUNT(*) AS c FROM "${table}" ${where}`,
      )?.c ?? 0;
    return {
      schemaVersion:
        this.db.get<{ user_version: number }>('PRAGMA user_version')
          ?.user_version ?? 0,
      parties: count('party', 'WHERE deleted_at IS NULL'),
      clients:
        this.db.get<{ c: number }>(
          'SELECT COUNT(*) AS c FROM client_profile cp JOIN party p ON p.id = cp.party_id WHERE cp.deleted_at IS NULL AND p.deleted_at IS NULL',
        )?.c ?? 0,
      files: count('case_file', 'WHERE deleted_at IS NULL'),
      cases: count('legal_case', 'WHERE deleted_at IS NULL'),
      hearings: count('hearing', 'WHERE deleted_at IS NULL'),
      judgments: count('judgment', 'WHERE deleted_at IS NULL'),
      tasks: count('task', 'WHERE deleted_at IS NULL'),
      documents: count('document', 'WHERE deleted_at IS NULL'),
      transactions: count('financial_transaction', 'WHERE deleted_at IS NULL'),
      auditEntries: count('audit_log'),
      pendingSyncChanges: count('sync_outbox', "WHERE state = 'pending'"),
      openConflicts: count('sync_conflict', "WHERE status = 'open'"),
      searchDocuments: count('search_document'),
      outboxFailed: count('sync_outbox', "WHERE state = 'failed'"),
    };
  }

  private names(sql: string): Set<string> {
    return new Set(this.db.query<{ name: string }>(sql).map((row) => row.name));
  }

  private detectFts5(): boolean {
    try {
      this.db.exec(
        'CREATE VIRTUAL TABLE temp.__health_fts_probe USING fts5(x)',
      );
      this.db.exec('DROP TABLE temp.__health_fts_probe');
      return true;
    } catch {
      return false;
    }
  }
}
