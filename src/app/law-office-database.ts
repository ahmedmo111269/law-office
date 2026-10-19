import type { DatabaseAdapter } from '../db/adapter.ts';
import { LAW_OFFICE_APPLICATION_ID } from '../db/constants.ts';
import { CASE_SYSTEM_MIGRATION } from '../db/migrations/0002_case_system.ts';
import { INITIAL_MIGRATION } from '../db/migrations/0001_initial.ts';
import { MigrationManager } from '../db/migrations/manager.ts';
import type { MigrationStatus } from '../db/migrations/manager.ts';
import { SqliteDatabase } from '../db/sqlite/sqlite-adapter.ts';
import { AppError } from '../errors.ts';
import {
  AppointmentRepository,
  ReminderRepository,
} from '../repositories/appointment-repository.ts';
import type { EntityRecord } from '../repositories/base-repository.ts';
import { BaseRepository } from '../repositories/base-repository.ts';
import { CaseFileRepository } from '../repositories/case-file-repository.ts';
import { CaseRepository } from '../repositories/case-repository.ts';
import { ContractRepository } from '../repositories/contract-repository.ts';
import { CourtRepository } from '../repositories/court-repository.ts';
import { DocumentRepository } from '../repositories/document-repository.ts';
import { FinanceRepository } from '../repositories/finance-repository.ts';
import { HearingRepository } from '../repositories/hearing-repository.ts';
import { JudgmentRepository } from '../repositories/judgment-repository.ts';
import { LookupRepository } from '../repositories/lookup-repository.ts';
import { PartyRepository } from '../repositories/party-repository.ts';
import { SettingsRepository } from '../repositories/settings-repository.ts';
import { SyncMetadataRepository } from '../repositories/sync-metadata-repository.ts';
import { TaskRepository } from '../repositories/task-repository.ts';
import { SearchService } from '../search/search-service.ts';
import { AuditService } from '../services/audit-service.ts';
import { DeviceService } from '../services/device-service.ts';
import type { DeviceRecord } from '../services/device-service.ts';
import { HealthService } from '../services/health-service.ts';
import { NumberSeriesService } from '../services/number-series.ts';
import { SYNC_ENTITY_DEFINITIONS } from '../sync/current-registry.ts';
import type { Clock } from '../util/clock.ts';
import { SystemClock } from '../util/clock.ts';
import { toCanonicalTimestamp } from '../util/dates.ts';
import { BackupManager } from '../backup/backup-manager.ts';

export interface LawOfficeDatabaseOptions {
  /** File path or `:memory:` (tests only). */
  readonly path: string;
  readonly appVersion?: string;
  readonly clock?: Clock;
  readonly deviceLabel?: string;
  readonly backupDir?: string;
  /** Disable migrations when opening an existing screen/read-only copy. */
  readonly migrateOnOpen?: boolean;
  readonly readOnly?: boolean;
}

export interface OpenResult {
  readonly database: LawOfficeDatabase;
  readonly device: DeviceRecord;
  readonly migration: MigrationStatus;
}

/**
 * Composition root for the data layer.
 *
 * The UI must talk to repositories exposed here, never to SQL. Swapping the
 * storage engine means passing a different `DatabaseAdapter`; repository
 * implementations are the only code that would need porting.
 *
 * Only registered entity types are reachable through `repository()`. That
 * registry is the single list the future sync layer enumerates, so an entity
 * that is not in the registry cannot silently escape sync/audit bookkeeping.
 */
export class LawOfficeDatabase {
  readonly db: DatabaseAdapter;
  readonly clock: Clock;
  readonly device: DeviceRecord;
  readonly audit: AuditService;
  readonly search: SearchService;
  readonly numbers: NumberSeriesService;
  readonly settings: SettingsRepository;
  readonly lookups: LookupRepository;
  readonly courts: CourtRepository;
  readonly parties: PartyRepository;
  readonly caseFiles: CaseFileRepository;
  readonly cases: CaseRepository;
  readonly hearings: HearingRepository;
  readonly judgments: JudgmentRepository;
  readonly tasks: TaskRepository;
  readonly documents: DocumentRepository;
  readonly contracts: ContractRepository;
  readonly finance: FinanceRepository;
  readonly appointments: AppointmentRepository;
  readonly reminders: ReminderRepository;
  readonly sync: SyncMetadataRepository;
  readonly health: HealthService;
  readonly backups: BackupManager;
  readonly migrations: MigrationManager;

  private readonly repositories: Map<string, BaseRepository>;
  private closed = false;

  private constructor(input: {
    db: DatabaseAdapter;
    clock: Clock;
    device: DeviceRecord;
    appVersion: string;
    backupDir: string;
  }) {
    this.db = input.db;
    this.clock = input.clock;
    this.device = input.device;
    this.search = new SearchService(input.db, input.clock);
    this.audit = new AuditService(input.clock, input.device.id);
    this.numbers = new NumberSeriesService(input.db, input.clock);

    const deps = {
      db: input.db,
      clock: input.clock,
      deviceId: input.device.id,
      audit: this.audit,
      search: this.search,
      repositoryFor: (entityCode: string): BaseRepository =>
        this.repository(entityCode),
    };
    this.settings = new SettingsRepository(deps);
    this.lookups = new LookupRepository(deps);

    const baseRepositories = new Map<string, BaseRepository>();
    for (const type of SYNC_ENTITY_DEFINITIONS) {
      if (
        !input.db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
          [type.table],
        )
      )
        continue;
      baseRepositories.set(type.code, new BaseRepository(deps, type));
    }
    // Populate before any repository can be resolved through `repositoryFor`,
    // because cascade deletes resolve other repositories lazily.
    this.repositories = baseRepositories;

    this.courts = new CourtRepository(deps, this.lookups);
    this.parties = new PartyRepository(deps, this.lookups, this.numbers);
    this.caseFiles = new CaseFileRepository(
      deps,
      this.lookups,
      this.numbers,
      this.settings,
    );
    this.cases = new CaseRepository(deps, this.lookups, this.settings);
    this.hearings = new HearingRepository(deps, this.lookups, this.settings);
    this.judgments = new JudgmentRepository(deps, this.lookups);
    this.tasks = new TaskRepository(deps, this.lookups);
    this.documents = new DocumentRepository(deps, this.lookups);
    this.contracts = new ContractRepository(deps, this.lookups, this.numbers);
    this.finance = new FinanceRepository(
      deps,
      this.lookups,
      this.numbers,
      this.settings,
    );
    this.appointments = new AppointmentRepository(
      deps,
      this.lookups,
      this.settings,
    );
    this.reminders = new ReminderRepository(deps);
    this.sync = new SyncMetadataRepository(input.db, this.clock);
    this.health = new HealthService(input.db);
    this.backups = new BackupManager(input.db, {
      backupDir: input.backupDir,
      appVersion: input.appVersion,
      deviceId: input.device.id,
      clock: input.clock,
      latestSchemaVersion: 2,
    });
    this.migrations = new MigrationManager(input.db, {
      clock: input.clock,
      appVersion: input.appVersion,
      migrations: [INITIAL_MIGRATION, CASE_SYSTEM_MIGRATION],
    });
  }

  repository(entityCode: string): BaseRepository {
    const found = this.repositories.get(entityCode);
    if (!found) {
      throw new AppError(
        'VALIDATION_FAILED',
        `unknown sync entity: ${entityCode}`,
      );
    }
    return found;
  }

  /** Generic access to any registered entity, for technical tools and tests. */
  entity(entityCode: string): BaseRepository<EntityRecord> {
    return this.repository(entityCode);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }

  /**
   * Opens (or creates) a database, applies pending migrations, registers the
   * local device on first run, and returns a fully wired data layer.
   */
  static open(options: LawOfficeDatabaseOptions): OpenResult {
    const clock = options.clock ?? new SystemClock();
    const appVersion = options.appVersion ?? '0.3.0';
    const readOnly = options.readOnly ?? false;
    const sqlite = SqliteDatabase.open({
      path: options.path,
      readOnly,
      createDirectories: true,
    });
    try {
      const migrations = new MigrationManager(sqlite, {
        clock,
        appVersion,
        migrations: [INITIAL_MIGRATION, CASE_SYSTEM_MIGRATION],
        ...(options.path !== ':memory:'
          ? {
              preMigrationBackup: () => {
                const deviceId = String(
                  sqlite.get<{ value: string }>(
                    "SELECT value FROM app_meta WHERE key='local.device_id'",
                  )?.value ?? 'legacy',
                );
                return new BackupManager(sqlite, {
                  backupDir: options.backupDir ?? `${options.path}.backups`,
                  appVersion,
                  deviceId,
                  clock,
                  latestSchemaVersion: 2,
                }).create({ label: 'pre-case-system-upgrade' }).path;
              },
            }
          : {}),
      });
      if (options.migrateOnOpen !== false) {
        migrations.migrate();
      }
      const status = migrations.status();
      if (!status.initialised) {
        throw new AppError(
          'INVALID_STATE',
          'database is not initialised; run migrate first',
        );
      }
      const deviceService = new DeviceService(sqlite, clock, appVersion);
      const device = options.deviceLabel
        ? deviceService.ensureRegistered({ label: options.deviceLabel })
        : deviceService.ensureRegistered();
      const backupDir =
        options.backupDir ??
        (options.path === ':memory:' ? ':memory:' : `${options.path}.backups`);
      // Touch app metadata so diagnostics can correlate schema/app versions.
      sqlite.run(
        `INSERT INTO app_meta (key, value, updated_at) VALUES ('app.version', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [appVersion, toCanonicalTimestamp(clock.now())],
      );
      const database = new LawOfficeDatabase({
        db: sqlite,
        clock,
        device,
        appVersion,
        backupDir,
      });
      database.search.initialize({ rebuildIfFlagged: true });
      return { database, device, migration: status };
    } catch (error) {
      sqlite.close();
      throw error;
    }
  }

  /** Diagnostics for a completely empty in-memory database, used by tests/CLI. */
  static openMemory(
    options: Omit<LawOfficeDatabaseOptions, 'path'> = {},
  ): OpenResult {
    return LawOfficeDatabase.open({ ...options, path: ':memory:' });
  }
}

export { LAW_OFFICE_APPLICATION_ID };
