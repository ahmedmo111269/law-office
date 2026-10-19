import type { EngineRow } from '../portable/store.ts';
/** File-wide roles are defaults. An explicit role for this case and person takes precedence without changing another degree. */
export function scopedPartyLinks(
  links: readonly EngineRow[],
  caseId?: string,
): EngineRow[] {
  if (!caseId) return links.filter((l) => l.deleted_at === null);
  const explicit = new Set(
    links
      .filter((l) => l.deleted_at === null && l.case_id === caseId)
      .map((l) => `${String(l.file_id)}:${String(l.party_id)}`),
  );
  return links.filter(
    (l) =>
      l.deleted_at === null &&
      (l.case_id === caseId ||
        (!l.case_id &&
          !explicit.has(`${String(l.file_id)}:${String(l.party_id)}`))),
  );
}
