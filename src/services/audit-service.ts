import { NotFoundError } from '../errors.ts';
import type { Clock } from '../util/clock.ts';
import { toCanonicalTimestamp } from '../util/dates.ts';
import { stableStringify } from '../util/stable.ts';
import { newId } from '../util/uuid.ts';
import type { DatabaseAdapter, SqlRow } from '../db/adapter.ts';

export type AuditAction =
  | 'insert'
  | 'update'
  | 'delete'
  | 'restore'
  | 'archive'
  | 'unarchive'
  | 'transaction_void'
  | 'migration'
  | 'backup'
  | 'restore_backup'
  | 'import'
  | 'identity_rotate'
  | 'setup';

export interface AuditChange {
  readonly from?: string | number | null;
  readonly to?: string | number | null;
}

export interface AuditInput {
  readonly action: AuditAction;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly summary?: string;
  readonly changes?: Readonly<Record<string, AuditChange>>;
  readonly sensitiveColumns?: readonly string[];
  readonly correlationId?: string;
}

export interface AuditEntry extends SqlRow {
  readonly id: string;
  readonly occurred_at: string;
  readonly actor_device_id: string;
  readonly action: AuditAction;
  readonly entity_type: string | null;
  readonly entity_id: string | null;
  readonly summary: string | null;
  readonly changes_json: string | null;
}

const MAX_CHANGES_JSON = 16_000;

/**
 * Append-only local activity log. It intentionally records field-level changes
 * with sensitive values redacted (see the entity registry). It never records
 * full documents, national IDs, tax numbers, addresses or file contents.
 */
export class AuditService {
  private readonly clock: Clock;
  private readonly deviceId: string;

  constructor(clock: Clock, deviceId: string) {
    this.clock = clock;
    this.deviceId = deviceId;
  }

  record(tx: DatabaseAdapter, input: AuditInput): void {
    const sensitive = new Set(input.sensitiveColumns ?? []);
    let changesJson: string | null = null;
    if (input.changes && Object.keys(input.changes).length > 0) {
      const redacted: Record<string, AuditChange> = {};
      for (const [field, change] of Object.entries(input.changes)) {
        if (sensitive.has(field)) {
          redacted[field] = { from: '[redacted]', to: '[redacted]' };
        } else {
          redacted[field] = change;
        }
      }
      changesJson = stableStringify(redacted);
      if (changesJson.length > MAX_CHANGES_JSON) {
        changesJson = stableStringify({
          truncated: true,
          fields: Object.keys(redacted),
        });
      }
    }

    tx.run(
      `INSERT INTO audit_log
        (id, occurred_at, actor_device_id, action, entity_type, entity_id,
         summary, changes_json, correlation_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        toCanonicalTimestamp(this.clock.now()),
        this.deviceId,
        input.action,
        input.entityType ?? null,
        input.entityId ?? null,
        input.summary?.slice(0, 500) ?? null,
        changesJson,
        input.correlationId ?? null,
      ],
    );
  }

  listRecent(adapter: DatabaseAdapter, limit = 50): AuditEntry[] {
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
    return adapter.query<AuditEntry>(
      'SELECT * FROM audit_log ORDER BY occurred_at DESC, rowid DESC LIMIT ?',
      [safeLimit],
    );
  }

  listForEntity(
    adapter: DatabaseAdapter,
    entityType: string,
    entityId: string,
    limit = 50,
  ): AuditEntry[] {
    const safeLimit = Math.max(1, Math.min(1000, Math.trunc(limit)));
    return adapter.query<AuditEntry>(
      `SELECT * FROM audit_log
       WHERE entity_type = ? AND entity_id = ?
       ORDER BY occurred_at DESC, rowid DESC LIMIT ?`,
      [entityType, entityId, safeLimit],
    );
  }

  requireEntry(adapter: DatabaseAdapter, id: string): AuditEntry {
    const entry = adapter.get<AuditEntry>('SELECT * FROM audit_log WHERE id = ?', [id]);
    if (!entry) throw new NotFoundError('AuditEntry', id);
    return entry;
  }
}
