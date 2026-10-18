/**
 * Overlay registry.
 *
 * Dialogs and side panels are appended to `document.body`, so they survive a
 * route change unless something closes them. The router closes every registered
 * overlay when it renders a new page, which prevents a stale modal from
 * covering an unrelated screen after back/forward navigation.
 */
type OverlayCloser = () => void;

const closers = new Set<OverlayCloser>();

/** Registers an overlay closer. The returned function removes it again. */
export function registerOverlay(close: OverlayCloser): () => void {
  closers.add(close);
  return () => {
    closers.delete(close);
  };
}

/** Closes every open overlay. Safe to call when nothing is open. */
export function closeAllOverlays(): void {
  for (const close of [...closers]) {
    try {
      close();
    } catch {
      // A half-torn-down overlay must not break navigation.
    }
  }
  closers.clear();
}
