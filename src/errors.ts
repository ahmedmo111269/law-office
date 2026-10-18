/**
 * Error model for the data layer.
 *
 * Every error carries a stable machine-readable `code`. UI layers must translate
 * codes — never parse the English message. Data-layer errors never contain
 * client secrets or full record payloads.
 */

export type AppErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'CONFLICT'
  | 'FOREIGN_KEY_VIOLATION'
  | 'UNIQUE_VIOLATION'
  | 'INVALID_STATE'
  | 'IMMUTABLE_RECORD'
  | 'MIGRATION_FAILED'
  | 'MIGRATION_CHECKSUM_MISMATCH'
  | 'SCHEMA_TOO_NEW'
  | 'BACKUP_FAILED'
  | 'BACKUP_CORRUPT'
  | 'BACKUP_INCOMPATIBLE'
  | 'RESTORE_REQUIRES_EMPTY_DATABASE'
  | 'RESTORE_FAILED'
  | 'UNSUPPORTED_ENGINE'
  | 'TRANSACTION_FAILED'
  | 'CHECK_CONSTRAINT'
  | 'DEPENDENT_RECORDS_EXIST'
  | 'ALREADY_DELETED'
  | 'NOT_DELETED'
  | 'SEARCH_UNAVAILABLE';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super('VALIDATION_FAILED', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super('NOT_FOUND', `${entity} not found`, { entity, id });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: AppErrorCode = 'CONFLICT', details?: Record<string, unknown>) {
    super(code, message, details);
  }
}

export class ImmutableRecordError extends AppError {
  constructor(entity: string, id: string) {
    super('IMMUTABLE_RECORD', `${entity} ${id} is append-only and cannot be modified`, { entity, id });
  }
}

export class MigrationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>, cause?: unknown) {
    super('MIGRATION_FAILED', message, details, cause);
  }
}

export class BackupError extends AppError {
  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>, cause?: unknown) {
    super(code, message, details, cause);
  }
}

/** Maps common SQLite constraint messages to stable codes. */
export function classifySqliteError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : String(error);
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    return new AppError('FOREIGN_KEY_VIOLATION', message);
  }
  if (/UNIQUE constraint failed/i.test(message)) {
    return new AppError('UNIQUE_VIOLATION', message);
  }
  if (/CHECK constraint failed/i.test(message)) {
    return new AppError('CHECK_CONSTRAINT', message);
  }
  if (/NOT NULL constraint failed/i.test(message)) {
    return new AppError('VALIDATION_FAILED', message);
  }
  return new AppError('TRANSACTION_FAILED', message);
}
