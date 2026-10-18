import type { DatabaseAdapter } from '../db/adapter.ts';

/**
 * The repository layer depends only on this port. The concrete search service
 * maintains the derived search index and can degrade to LIKE when FTS5 is
 * unavailable, without changing repository code.
 */
export interface SearchIndexPort {
  /**
   * Called inside the same transaction as the write. The implementation
   * re-reads the row and creates/updates/removes its derived search document.
   * It must be safe to call for entities that are not indexed.
   */
  handleEntityChange(tx: DatabaseAdapter, entityType: string, entityId: string): void;
}
