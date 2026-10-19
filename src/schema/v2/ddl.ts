/** Additive v2 only. Never edit v1 or rebuild/drop user tables. */
const HEADER = `
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
  origin_device_id TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local' CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT`;
export const CASE_SYSTEM_DDL = `
ALTER TABLE case_file ADD COLUMN case_type_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT;
ALTER TABLE case_file ADD COLUMN subtype_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT;
ALTER TABLE case_file ADD COLUMN nature_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT;
ALTER TABLE case_file ADD COLUMN subject TEXT;
ALTER TABLE case_file ADD COLUMN facts TEXT;
ALTER TABLE case_file ADD COLUMN requests TEXT;
ALTER TABLE case_file ADD COLUMN office_capacity TEXT;
ALTER TABLE case_file ADD COLUMN dispute_started_on TEXT;
ALTER TABLE case_file ADD COLUMN last_action_on TEXT;
ALTER TABLE case_file ADD COLUMN next_action TEXT;
ALTER TABLE case_file ADD COLUMN follow_up_on TEXT;
ALTER TABLE case_file ADD COLUMN internal_notes TEXT;
ALTER TABLE case_file ADD COLUMN specialized_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE case_file ADD COLUMN template_snapshot_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE case_file ADD COLUMN intake_enabled INTEGER NOT NULL DEFAULT 0 CHECK (intake_enabled IN (0,1));
ALTER TABLE legal_case ADD COLUMN office_capacity TEXT;
ALTER TABLE legal_case ADD COLUMN procedural_result TEXT;
ALTER TABLE case_file_party ADD COLUMN is_office_client INTEGER NOT NULL DEFAULT 0 CHECK (is_office_client IN (0,1));
ALTER TABLE court ADD COLUMN aliases_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE court ADD COLUMN level_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT;
-- Dependency invalidation and domain lookups used by both engines (no case-table scans).
CREATE INDEX case_file_type_idx ON case_file (case_type_id) WHERE deleted_at IS NULL;
CREATE INDEX case_file_subtype_idx ON case_file (subtype_id) WHERE deleted_at IS NULL;
CREATE INDEX case_file_nature_idx ON case_file (nature_id) WHERE deleted_at IS NULL;
CREATE INDEX case_file_responsible_idx ON case_file (responsible_party_id) WHERE deleted_at IS NULL;
CREATE INDEX legal_case_type_idx ON legal_case (case_type_id) WHERE deleted_at IS NULL;
CREATE INDEX legal_case_degree_idx ON legal_case (litigation_degree_id) WHERE deleted_at IS NULL;
CREATE INDEX legal_case_circuit_idx ON legal_case (circuit_id) WHERE deleted_at IS NULL;
CREATE INDEX case_file_party_role_idx ON case_file_party (role_id) WHERE deleted_at IS NULL;
CREATE TABLE procedural_stage (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES case_file(id) ON DELETE RESTRICT,
  case_id TEXT REFERENCES legal_case(id) ON DELETE RESTRICT,
  type_id TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  custom_type TEXT,
  authority_id TEXT REFERENCES court(id) ON DELETE RESTRICT,
  authority_name_snapshot TEXT,
  reference_number TEXT,
  reference_year INTEGER CHECK (reference_year IS NULL OR reference_year BETWEEN 1900 AND 2200),
  started_on TEXT, submitted_on TEXT, notified_on TEXT, attended_on TEXT, decision_on TEXT,
  completed_on TEXT, follow_up_on TEXT,
  status_id TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  outcome TEXT, decision TEXT, closing_reason TEXT,
  previous_stage_id TEXT REFERENCES procedural_stage(id) ON DELETE RESTRICT,
  source_document_id TEXT REFERENCES document(id) ON DELETE RESTRICT,
  data_source TEXT, notes TEXT,
  ${HEADER},
  CHECK (previous_stage_id IS NULL OR previous_stage_id <> id),
  CHECK (completed_on IS NULL OR started_on IS NULL OR completed_on >= started_on)
) STRICT;
CREATE INDEX procedural_stage_file_idx ON procedural_stage (file_id, started_on) WHERE deleted_at IS NULL;
CREATE INDEX procedural_stage_case_idx ON procedural_stage (case_id) WHERE deleted_at IS NULL;
CREATE INDEX procedural_stage_previous_idx ON procedural_stage (previous_stage_id) WHERE deleted_at IS NULL;
CREATE INDEX procedural_stage_authority_idx ON procedural_stage (authority_id) WHERE deleted_at IS NULL;
CREATE INDEX procedural_stage_type_idx ON procedural_stage (type_id) WHERE deleted_at IS NULL;
CREATE INDEX procedural_stage_status_idx ON procedural_stage (status_id) WHERE deleted_at IS NULL;
CREATE TABLE case_term (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES case_file(id) ON DELETE RESTRICT,
  case_id TEXT REFERENCES legal_case(id) ON DELETE RESTRICT,
  term_id TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  ${HEADER}
) STRICT;
CREATE UNIQUE INDEX case_term_file_uq ON case_term (file_id, term_id) WHERE deleted_at IS NULL AND case_id IS NULL;
CREATE UNIQUE INDEX case_term_case_uq ON case_term (case_id, term_id) WHERE deleted_at IS NULL AND case_id IS NOT NULL;
CREATE INDEX case_term_file_idx ON case_term (file_id) WHERE deleted_at IS NULL;
CREATE INDEX case_term_term_page_idx ON case_term (term_id, id) WHERE deleted_at IS NULL;
CREATE INDEX case_term_term_idx ON case_term (term_id) WHERE deleted_at IS NULL;
ALTER TABLE document_link ADD COLUMN stage_id TEXT REFERENCES procedural_stage(id) ON DELETE RESTRICT;
CREATE INDEX document_link_stage_idx ON document_link (stage_id) WHERE deleted_at IS NULL;
ALTER TABLE task ADD COLUMN stage_id TEXT REFERENCES procedural_stage(id) ON DELETE RESTRICT;
ALTER TABLE appointment ADD COLUMN stage_id TEXT REFERENCES procedural_stage(id) ON DELETE RESTRICT;
ALTER TABLE judgment_appeal ADD COLUMN appeal_case_id TEXT REFERENCES legal_case(id) ON DELETE RESTRICT;
ALTER TABLE judgment_appeal ADD COLUMN authority_id TEXT REFERENCES court(id) ON DELETE RESTRICT;
-- Existing search_document is a rebuildable projection, not a parallel case store.
ALTER TABLE search_document ADD COLUMN case_scope TEXT;
ALTER TABLE search_document ADD COLUMN file_id TEXT;
ALTER TABLE search_document ADD COLUMN case_type_id TEXT;
ALTER TABLE search_document ADD COLUMN subtype_id TEXT;
ALTER TABLE search_document ADD COLUMN nature_id TEXT;
ALTER TABLE search_document ADD COLUMN court_id TEXT;
ALTER TABLE search_document ADD COLUMN circuit_id TEXT;
ALTER TABLE search_document ADD COLUMN degree_id TEXT;
ALTER TABLE search_document ADD COLUMN case_year INTEGER;
ALTER TABLE search_document ADD COLUMN case_number TEXT;
ALTER TABLE search_document ADD COLUMN status_id TEXT;
ALTER TABLE search_document ADD COLUMN responsible_party_id TEXT;
ALTER TABLE search_document ADD COLUMN priority_id TEXT;
ALTER TABLE search_document ADD COLUMN stage_type_id TEXT;
ALTER TABLE search_document ADD COLUMN stage_status_id TEXT;
ALTER TABLE search_document ADD COLUMN registered_on TEXT;
ALTER TABLE search_document ADD COLUMN judgment_on TEXT;
ALTER TABLE search_document ADD COLUMN last_action_on TEXT;
ALTER TABLE search_document ADD COLUMN follow_up_on TEXT;
ALTER TABLE search_document ADD COLUMN latest_hearing_at TEXT;
ALTER TABLE search_document ADD COLUMN has_hearing INTEGER NOT NULL DEFAULT 0;
ALTER TABLE search_document ADD COLUMN has_pre_stage INTEGER NOT NULL DEFAULT 0;
ALTER TABLE search_document ADD COLUMN has_related INTEGER NOT NULL DEFAULT 0;
ALTER TABLE search_document ADD COLUMN has_appeal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE search_document ADD COLUMN has_documents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE search_document ADD COLUMN needs_next INTEGER NOT NULL DEFAULT 0;
ALTER TABLE search_document ADD COLUMN missing_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE search_document ADD COLUMN archived_at TEXT;
-- Specific list patterns: scope/type/status + recent procedure; court/year/number; phase/follow-up.
CREATE INDEX case_search_type_status_idx ON search_document (case_scope, case_type_id, status_id, last_action_on);
CREATE INDEX case_search_court_year_idx ON search_document (court_id, case_year, case_number);
CREATE INDEX case_search_stage_follow_idx ON search_document (stage_type_id, stage_status_id, follow_up_on);
-- Recent pages and exact scope/type/status counts; PK suffix also enables
-- bounded keyset scans in browsers when a text predicate needs evaluation.
CREATE INDEX case_search_recent_idx ON search_document (case_scope, updated_at, id);
CREATE INDEX case_search_type_recent_idx ON search_document (case_type_id, case_scope, updated_at, id);
CREATE INDEX case_search_status_recent_idx ON search_document (status_id, case_scope, updated_at, id);
CREATE INDEX case_search_stage_recent_idx ON search_document (stage_type_id, case_scope, updated_at, id);
CREATE INDEX case_party_person_page_idx ON case_file_party (party_id, id);
CREATE INDEX case_party_role_page_idx ON case_file_party (role_id, id);
CREATE INDEX case_search_file_idx ON search_document (file_id);
`;
