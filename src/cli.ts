#!/usr/bin/env node
/**
 * Technical database CLI.
 *
 * This is intentionally a thin operator tool, not a user interface: it opens the
 * local database, runs migrations, prints diagnostics, and manages backups.
 * All destructive operations require explicit paths and refuse to overwrite.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { BackupManager } from './backup/backup-manager.ts';
import { LawOfficeDatabase } from './app/law-office-database.ts';
import { SqliteDatabase } from './db/sqlite/sqlite-adapter.ts';
import { AppError } from './errors.ts';
import { SystemClock } from './util/clock.ts';

const APP_VERSION = '0.3.0';
const DEFAULT_DB = process.env.LAW_OFFICE_DB ?? 'data/law-office.sqlite';

interface Parsed {
  readonly command: string;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
}

function parse(argv: readonly string[]): Parsed {
  const [command = 'help', ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!;
    if (arg.startsWith('--')) {
      const [name, inline] = arg.slice(2).split('=', 2) as [
        string,
        string | undefined,
      ];
      if (inline !== undefined) {
        flags[name] = inline;
      } else {
        const next = rest[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[name] = next;
          i += 1;
        } else {
          flags[name] = true;
        }
      }
    } else {
      positionals.push(arg);
    }
  }
  return { command, positionals, flags };
}

function dbPath(parsed: Parsed): string {
  return typeof parsed.flags.db === 'string' ? parsed.flags.db : DEFAULT_DB;
}

function backupDir(parsed: Parsed): string {
  return typeof parsed.flags.dir === 'string'
    ? resolve(parsed.flags.dir)
    : resolve(
        dbPath(parsed) === ':memory:'
          ? 'data/backups'
          : `${dbPath(parsed)}.backups`,
      );
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function open(parsed: Parsed): LawOfficeDatabase {
  const path = dbPath(parsed);
  const result = LawOfficeDatabase.open({
    path,
    appVersion: APP_VERSION,
    backupDir: backupDir(parsed),
    ...(typeof parsed.flags.device === 'string'
      ? { deviceLabel: parsed.flags.device }
      : {}),
  });
  return result.database;
}

function help(): void {
  process.stdout.write(
    `law-office db CLI (offline, local-only)\n\n` +
      `Usage: node --disable-warning=ExperimentalWarning src/cli.ts <command> [options]\n\n` +
      `Commands:\n` +
      `  init                  create/migrate the database, register this device\n` +
      `  check                 integrity + schema manifest + foreign-key check (exit 1 on failure)\n` +
      `  info                  schema version, device, row counts, engine details\n` +
      `  backup [--label X]    create a verified WAL-safe backup\n` +
      `  verify <file>         verify a backup file and its checksum sidecar\n` +
      `  backups               list backup files in the backup directory\n` +
      `  restore <file> <new>  restore into a new database path (refuses to overwrite unless --force)\n` +
      `  search <text>         search indexed entities\n` +
      `  reindex               rebuild the search index\n` +
      `  migrate               apply pending migrations\n\n` +
      `Options:\n` +
      `  --db <path>           database file (default: ${DEFAULT_DB})\n` +
      `  --dir <path>          backup directory\n` +
      `  --device <label>      label used when registering this device\n` +
      `  --json                machine-readable output\n`,
  );
}

function cmdInit(parsed: Parsed): void {
  const db = open(parsed);
  try {
    const health = db.health.schemaCheck();
    print({
      database: dbPath(parsed),
      createdOrOpened: true,
      device: {
        id: db.device.id,
        code: db.device.short_code,
        platform: db.device.platform,
      },
      migration: db.migrations.status(),
      health,
    });
  } finally {
    db.close();
  }
}

function cmdCheck(parsed: Parsed): void {
  const db = open(parsed);
  try {
    const report = db.health.schemaCheck();
    print({ database: dbPath(parsed), ...report });
    if (!report.ok) process.exit(1);
  } finally {
    db.close();
  }
}

function cmdInfo(parsed: Parsed): void {
  const db = open(parsed);
  try {
    print({
      database: dbPath(parsed),
      engine: db.db.describe(),
      migration: db.migrations.status(),
      history: db.migrations.appliedRows(),
      device: db.device,
      health: db.health.schemaCheck(),
      stats: db.health.stats(),
    });
  } finally {
    db.close();
  }
}

function cmdBackup(parsed: Parsed): void {
  const db = open(parsed);
  try {
    const info = db.backups.create({
      ...(typeof parsed.flags.label === 'string'
        ? { label: parsed.flags.label }
        : {}),
      destinationDir: backupDir(parsed),
    });
    const verification = db.backups.verify(info.path, {
      requireChecksumSidecar: true,
    });
    print({ backup: info, verification });
    if (!verification.valid) process.exit(1);
  } finally {
    db.close();
  }
}

function cmdVerify(parsed: Parsed): void {
  const file = parsed.positionals[0];
  if (!file) fail('usage: verify <backup-file>');
  const db = SqliteDatabase.open({ path: ':memory:' });
  try {
    const manager = new BackupManager(db, {
      backupDir: backupDir(parsed),
      appVersion: APP_VERSION,
      deviceId: '00000000-0000-0000-0000-000000000000',
      clock: new SystemClock(),
      latestSchemaVersion: 1,
    });
    const result = manager.verify(file, { requireChecksumSidecar: true });
    print(result);
    if (!result.valid) process.exit(1);
  } finally {
    db.close();
  }
}

function cmdBackups(parsed: Parsed): void {
  const dir = backupDir(parsed);
  if (!existsSync(dir)) {
    print({ directory: dir, backups: [] });
    return;
  }
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.sqlite'))
    .sort()
    .map((name) => {
      const path = resolve(dir, name);
      const stat = statSync(path);
      return {
        file: basename(path),
        path,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
        checksumSidecar: existsSync(`${path}.sha256`),
      };
    });
  print({ directory: dir, backups: files });
}

function cmdRestore(parsed: Parsed): void {
  const [file, target] = parsed.positionals;
  if (!file || !target)
    fail('usage: restore <backup-file> <new-database-path>');
  if (resolve(target) === resolve(dbPath(parsed)) && !parsed.flags.force) {
    fail('refusing to restore over the active database without --force');
  }
  const db = SqliteDatabase.open({ path: ':memory:' });
  try {
    const manager = new BackupManager(db, {
      backupDir: backupDir(parsed),
      appVersion: APP_VERSION,
      deviceId: '00000000-0000-0000-0000-000000000000',
      clock: new SystemClock(),
      latestSchemaVersion: 1,
    });
    const result = manager.restoreToNewDatabase(file, target, {
      force: parsed.flags.force === true || parsed.flags.force === 'true',
    });
    print(result);
  } finally {
    db.close();
  }
}

function cmdSearch(parsed: Parsed): void {
  const text = parsed.positionals.join(' ').trim();
  if (!text) fail('usage: search <text>');
  const db = open(parsed);
  try {
    const limit =
      typeof parsed.flags.limit === 'string' ? Number(parsed.flags.limit) : 20;
    const hits = db.search.search(text, {
      limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 20,
      ...(typeof parsed.flags.type === 'string'
        ? { entityType: parsed.flags.type }
        : {}),
    });
    print({ query: text, fts5: db.search.usingFts5, hits });
  } finally {
    db.close();
  }
}

function cmdReindex(parsed: Parsed): void {
  const db = open(parsed);
  try {
    print(db.search.rebuildAll());
  } finally {
    db.close();
  }
}

function cmdMigrate(parsed: Parsed): void {
  const db = open(parsed);
  try {
    print({
      migration: db.migrations.status(),
      history: db.migrations.appliedRows(),
    });
  } finally {
    db.close();
  }
}

function main(): void {
  const parsed = parse(process.argv.slice(2));
  switch (parsed.command) {
    case 'init':
      cmdInit(parsed);
      break;
    case 'check':
      cmdCheck(parsed);
      break;
    case 'info':
      cmdInfo(parsed);
      break;
    case 'backup':
      cmdBackup(parsed);
      break;
    case 'verify':
      cmdVerify(parsed);
      break;
    case 'backups':
      cmdBackups(parsed);
      break;
    case 'restore':
      cmdRestore(parsed);
      break;
    case 'search':
      cmdSearch(parsed);
      break;
    case 'reindex':
      cmdReindex(parsed);
      break;
    case 'migrate':
      cmdMigrate(parsed);
      break;
    case 'help':
    case '--help':
    case '-h':
      help();
      break;
    default:
      fail(`unknown command: ${parsed.command}\n\nRun with "help" for usage.`);
  }
}

try {
  main();
} catch (error) {
  if (error instanceof AppError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
    if (error.details)
      process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
  } else {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
  }
  process.exit(1);
}
