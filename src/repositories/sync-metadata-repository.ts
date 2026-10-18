import type { SqlRow } from '../db/adapter.ts';
import { NotFoundError, ValidationError } from '../errors.ts';
import { getSyncEntity } from '../sync/entity-registry.ts';
import type { Clock } from '../util/clock.ts';
import { toCanonicalTimestamp } from '../util/dates.ts';
import { newId } from '../util/uuid.ts';
import type { DatabaseAdapter } from '../db/adapter.ts';

export interface OutboxRow extends SqlRow {
  readonly id: string;
  readonly sequence: number;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly operation: 'insert' | 'update' | 'delete' | 'restore';
  readonly payload_json: string;
  readonly changed_fields_json: string;
  readonly origin_device_id: string;
  readonly created_at: string;
  readonly state: 'pending' | 'sending' | 'sent' | 'failed' | 'discarded';
  readonly attempt_count: number;
  readonly last_error: string | null;
}

export interface SyncStats {
  readonly pending: number;
  readonly sending: number;
  readonly sent: number;
  readonly failed: number;
  readonly openConflicts: number;
  readonly lastQueuedAt: string | null;
}

/**
 * Local half of the future sync protocol. It queues and tracks changes but
 * deliberately implements no network transport. Applying remote changes must
 * be built as a separate, reviewed component with the documented conflict
 * policy; a fake "sync" button would be worse than none.
 */
export class SyncMetadataRepository {
  private readonly db: DatabaseAdapter;
  private readonly clock: Clock;

  constructor(db: DatabaseAdapter, clock: Clock) {
    this.db = db;
    this.clock = clock;
  }

  pendingChanges(limit = 100, offset = 0): OutboxRow[] {
    return this.db.query<OutboxRow>(
      `SELECT * FROM sync_outbox
       WHERE state IN ('pending','failed')
       ORDER BY sequence LIMIT ? OFFSET ?`,
      [limit, offset],
    );
  }

  stats(): SyncStats {
    const row = this.db.get<SqlRow>(
      `SELECT
         SUM(CASE WHEN state = 'pending' THEN 1 ELSE 0 END) AS pending,
         SUM(CASE WHEN state = 'sending' THEN 1 ELSE 0 END) AS sending,
         SUM(CASE WHEN state = 'sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS failed,
         MAX(created_at) AS last_queued_at
       FROM sync_outbox`,
    );
    const conflicts = this.db.get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM sync_conflict WHERE status = 'open'",
    );
    return {
      pending: Number(row?.pending ?? 0),
      sending: Number(row?.sending ?? 0),
      sent: Number(row?.sent ?? 0),
      failed: Number(row?.failed ?? 0),
      openConflicts: conflicts?.c ?? 0,
      lastQueuedAt: row?.last_queued_at === null || row?.last_queued_at === undefined
        ? null
        : String(row.last_queued_at),
    };
  }

  markSending(ids: readonly string[]): void {
    if (ids.length === 0) return;
    const now = toCanonicalTimestamp(this.clock.now());
    this.db.transaction((tx) => {
      for (const id of ids) {
        tx.run(
          `UPDATE sync_outbox SET state = 'sending', last_attempt_at = ?,
             attempt_count = attempt_count + 1
           WHERE id = ? AND state IN ('pending','failed')`,
          [now, id],
        );
      }
    });
  }

  markSent(ids: readonly string[]): void {
    if (ids.length === 0) return;
    const now = toCanonicalTimestamp(this.clock.now());
    this.db.transaction((tx) => {
      for (const id of ids) {
        const row = tx.get<OutboxRow>('SELECT * FROM sync_outbox WHERE id = ?', [id]);
        if (!row) throw new NotFoundError('sync_outbox', id);
        tx.run(
          `UPDATE sync_outbox SET state = 'sent', sent_at = ?, last_attempt_at = ?,
             last_error = NULL
           WHERE id = ?`,
          [now, now, id],
        );
        const newer = tx.get<{ c: number }>(
          `SELECT COUNT(*) AS c FROM sync_outbox
           WHERE entity_type = ? AND entity_id = ? AND id <> ?
             AND state IN ('pending','sending','failed')`,
          [row.entity_type, row.entity_id, id],
        );
        if ((newer?.c ?? 0) === 0) {
          this.markEntitySynced(tx, row.entity_type, row.entity_id, now);
        }
      }
    });
  }

  markFailed(ids: readonly string[], error: string): void {
    if (ids.length === 0) return;
    const now = toCanonicalTimestamp(this.clock.now());
    this.db.transaction((tx) => {
      for (const id of ids) {
        tx.run(
          `UPDATE sync_outbox SET state = 'failed', last_error = ?, last_attempt_at = ?
           WHERE id = ?`,
          [error.slice(0, 1000), now, id],
        );
      }
    });
  }

  recordConflict(input: {
    entityType: string;
    entityId: string;
    baseRevision: number | null;
    localRevision: number | null;
    remoteRevision: number | null;
    localDeviceId: string;
    remoteDeviceId: string;
    localPayload: unknown;
    remotePayload: unknown;
    conflictingFields: readonly string[];
  }): string {
    if (input.conflictingFields.length === 0) {
      throw new ValidationError('a conflict must list at least one field');
    }
    const id = newId();
    const now = toCanonicalTimestamp(this.clock.now());
    this.db.run(
      `INSERT OR IGNORE INTO sync_conflict
        (id, entity_type, entity_id, base_revision, local_revision, remote_revision,
         local_device_id, remote_device_id, local_payload, remote_payload,
         conflicting_fields_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [
        id,
        input.entityType,
        input.entityId,
        input.baseRevision,
        input.localRevision,
        input.remoteRevision,
        input.localDeviceId,
        input.remoteDeviceId,
        JSON.stringify(input.localPayload),
        JSON.stringify(input.remotePayload),
        JSON.stringify(input.conflictingFields),
        now,
        now,
      ],
    );
    return id;
  }

  openConflicts(limit = 100): SqlRow[] {
    return this.db.query<SqlRow>(
      "SELECT * FROM sync_conflict WHERE status = 'open' ORDER BY created_at LIMIT ?",
      [limit],
    );
  }

  resolveConflict(id: string, resolution: 'local' | 'remote' | 'merged' | 'manual'): void {
    const now = toCanonicalTimestamp(this.clock.now());
    const result = this.db.run(
      `UPDATE sync_conflict SET status = 'resolved', resolution = ?, resolved_at = ?, updated_at = ?
       WHERE id = ? AND status = 'open'`,
      [resolution, now, now, id],
    );
    if (result.changes === 0) throw new NotFoundError('sync_conflict', id);
  }

  private markEntitySynced(
    tx: DatabaseAdapter,
    entityType: string,
    entityId: string,
    now: string,
  ): void {
    const definition = getSyncEntity(entityType);
    tx.run(
      `UPDATE "${definition.table}" SET sync_status = 'synced', last_synced_at = ?
       WHERE "${definition.primaryKeyColumn}" = ?`,
      [now, entityId],
    );
  }
}
