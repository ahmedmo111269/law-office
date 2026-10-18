/**
 * App-wide "data changed" notifications.
 *
 * Pages and tables never talk to each other directly. A write that commits
 * through the services layer announces itself here, and any mounted table
 * reloads its current page from the database. This keeps every screen honest
 * after a dialog save without threading a refresh callback through each page.
 */
type DataChangedListener = () => void;

const listeners = new Set<DataChangedListener>();

/** Subscribes to committed writes. Returns an unsubscribe function. */
export function onDataChanged(listener: DataChangedListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announces that a write has committed and visible views may be stale. */
export function notifyDataChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // A stale or detached view must never fail the writer.
    }
  }
}
