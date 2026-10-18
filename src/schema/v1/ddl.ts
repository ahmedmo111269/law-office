/**
 * Schema v1 — canonical DDL for the local SQLite database.
 *
 * Conventions (enforced by app layer + STRICT tables):
 *  - UUID text identifiers; never the visible number.
 *  - ISO-8601 UTC timestamps with milliseconds.
 *  - Calendar dates as YYYY-MM-DD.
 *  - Money as integer minor units (piastres).
 *  - Booleans as INTEGER 0/1 with CHECK constraints.
 *  - Soft deletion via deleted_at; archiving via archived_at (a different concept).
 *  - Every syncable table carries the common sync header:
 *      created_at, updated_at, deleted_at, origin_device_id, revision,
 *      sync_status, last_synced_at
 *  - Seeds are inserted by migration 1, not by DDL defaults, so identifiers are
 *    deterministic and the same on every device.
 *
 * This file is intentionally engine-specific. It is NOT valid IndexedDB code;
 * the web adapter would require a separate, logically-equivalent schema.
 */

export const SCHEMA_V1_DDL = `
-- ============================================================================
-- 1. PLATFORM, SETTINGS, LOOKUPS, NUMBERING, DEVICES
-- ============================================================================

CREATE TABLE app_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE schema_migration (
  version      INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  checksum     TEXT NOT NULL,
  applied_at   TEXT NOT NULL,
  execution_ms INTEGER NOT NULL,
  app_version  TEXT NOT NULL,
  backup_path  TEXT
) STRICT;

CREATE TABLE migration_failure (
  id            TEXT PRIMARY KEY,
  version       INTEGER NOT NULL,
  name          TEXT NOT NULL,
  failed_at     TEXT NOT NULL,
  message       TEXT NOT NULL,
  details_json  TEXT,
  backup_path   TEXT
) STRICT;

CREATE TABLE local_device (
  id              TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  platform        TEXT NOT NULL CHECK (platform IN
                    ('windows','macos','linux','android','ios','web','system','test','unknown')),
  short_code      TEXT NOT NULL UNIQUE,
  app_version     TEXT,
  timezone        TEXT NOT NULL DEFAULT 'Africa/Cairo',
  is_local        INTEGER NOT NULL DEFAULT 0 CHECK (is_local IN (0,1)),
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  origin_device_id TEXT NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status     TEXT NOT NULL DEFAULT 'local'
                    CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at  TEXT
) STRICT;

CREATE TABLE device_setting (
  device_id  TEXT NOT NULL REFERENCES local_device(id) ON DELETE RESTRICT,
  key        TEXT NOT NULL,
  value      TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string','number','boolean','json')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (device_id, key)
) STRICT;

CREATE TABLE currency (
  code        TEXT PRIMARY KEY CHECK (length(code) = 3),
  name_ar     TEXT NOT NULL,
  name_en     TEXT,
  symbol      TEXT,
  minor_units INTEGER NOT NULL DEFAULT 2 CHECK (minor_units BETWEEN 0 AND 4),
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
) STRICT;

CREATE TABLE number_series (
  key        TEXT NOT NULL,
  scope      TEXT NOT NULL DEFAULT '',
  prefix     TEXT NOT NULL DEFAULT '',
  suffix     TEXT NOT NULL DEFAULT '',
  format     TEXT NOT NULL DEFAULT '{prefix}{value}{suffix}',
  padding    INTEGER NOT NULL DEFAULT 4 CHECK (padding BETWEEN 0 AND 12),
  next_value INTEGER NOT NULL DEFAULT 1 CHECK (next_value >= 1),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (key, scope)
) STRICT;

CREATE TABLE office_profile (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL CHECK (length(trim(name)) > 0),
  legal_form               TEXT,
  address_line             TEXT,
  city                     TEXT,
  governorate_id           TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  phone                    TEXT,
  email                    TEXT,
  website                  TEXT,
  tax_registration_no      TEXT,
  commercial_registry_no   TEXT,
  bar_association_no       TEXT,
  is_configured            INTEGER NOT NULL DEFAULT 0 CHECK (is_configured IN (0,1)),
  notes                    TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL,
  deleted_at               TEXT,
  origin_device_id         TEXT NOT NULL,
  revision                 INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status              TEXT NOT NULL DEFAULT 'local'
                             CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at           TEXT
) STRICT;

CREATE TABLE office_setting (
  id         TEXT PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string','number','boolean','json')),
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  origin_device_id TEXT NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE TABLE lookup_list (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 1 AND 64),
  name_ar     TEXT NOT NULL,
  name_en     TEXT,
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  is_extensible INTEGER NOT NULL DEFAULT 1 CHECK (is_extensible IN (0,1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  origin_device_id TEXT NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE TABLE lookup_item (
  id          TEXT PRIMARY KEY,
  list_id     TEXT NOT NULL REFERENCES lookup_list(id) ON DELETE RESTRICT,
  code        TEXT NOT NULL CHECK (length(code) BETWEEN 1 AND 64),
  name_ar     TEXT NOT NULL CHECK (length(trim(name_ar)) > 0),
  name_en     TEXT,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  parent_id   TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_system   INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0,1)),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  origin_device_id TEXT NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT,
  UNIQUE (list_id, code)
) STRICT;

CREATE INDEX lookup_item_list_idx ON lookup_item (list_id, is_active, sort_order);
CREATE INDEX lookup_item_parent_idx ON lookup_item (parent_id);

-- ============================================================================
-- 2. PARTIES: PERSONS, ORGANISATIONS, CLIENTS, CONTACTS, RELATIONSHIPS
-- ============================================================================

CREATE TABLE party (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('person','organization')),
  display_name  TEXT NOT NULL CHECK (length(trim(display_name)) > 0),
  status_id     TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  notes         TEXT,
  archived_at   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  origin_device_id TEXT NOT NULL,
  revision      INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status   TEXT NOT NULL DEFAULT 'local'
                  CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE INDEX party_display_name_idx ON party (display_name) WHERE deleted_at IS NULL;
CREATE INDEX party_kind_idx ON party (kind) WHERE deleted_at IS NULL;
CREATE INDEX party_status_idx ON party (status_id) WHERE deleted_at IS NULL;
CREATE INDEX party_archived_idx ON party (archived_at);

CREATE TABLE person (
  party_id        TEXT PRIMARY KEY REFERENCES party(id) ON DELETE CASCADE,
  first_name      TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
  middle_name     TEXT,
  last_name       TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
  national_id     TEXT,
  national_id_type TEXT CHECK (national_id_type IN
                    ('national_id','passport','residence','other')),
  birth_date      TEXT,
  gender          TEXT CHECK (gender IN ('male','female','unknown')),
  nationality     TEXT,
  marital_status_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  occupation      TEXT,
  death_date      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  origin_device_id TEXT NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status     TEXT NOT NULL DEFAULT 'local'
                    CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at  TEXT
) STRICT;

CREATE UNIQUE INDEX person_national_id_uq ON person (national_id)
  WHERE national_id IS NOT NULL AND national_id <> '';

CREATE TABLE organization (
  party_id               TEXT PRIMARY KEY REFERENCES party(id) ON DELETE CASCADE,
  legal_name             TEXT NOT NULL CHECK (length(trim(legal_name)) > 0),
  trade_name             TEXT,
  legal_form_id          TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  commercial_registry_no TEXT,
  tax_id                 TEXT,
  established_on         TEXT,
  registry_office        TEXT,
  notes                  TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  deleted_at             TEXT,
  origin_device_id       TEXT NOT NULL,
  revision               INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status            TEXT NOT NULL DEFAULT 'local'
                           CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at         TEXT
) STRICT;

CREATE TABLE client_profile (
  party_id    TEXT PRIMARY KEY REFERENCES party(id) ON DELETE CASCADE,
  client_code TEXT NOT NULL UNIQUE,
  client_since TEXT,
  status_id   TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  source_id   TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  notes       TEXT,
  archived_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  origin_device_id TEXT NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE INDEX client_profile_status_idx ON client_profile (status_id) WHERE deleted_at IS NULL;

CREATE TABLE party_contact (
  id          TEXT PRIMARY KEY,
  party_id    TEXT NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  contact_type_id TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  value       TEXT NOT NULL CHECK (length(trim(value)) > 0),
  label       TEXT,
  is_primary  INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  verified_at TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  origin_device_id TEXT NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE UNIQUE INDEX party_contact_unique_idx
  ON party_contact (party_id, contact_type_id, value) WHERE deleted_at IS NULL;
CREATE INDEX party_contact_party_idx ON party_contact (party_id) WHERE deleted_at IS NULL;

CREATE TABLE party_address (
  id             TEXT PRIMARY KEY,
  party_id       TEXT NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  address_type_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  country        TEXT NOT NULL DEFAULT 'EG',
  governorate_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  city           TEXT,
  district       TEXT,
  street         TEXT,
  building_no    TEXT,
  floor          TEXT,
  apartment      TEXT,
  postal_code    TEXT,
  is_primary     INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT,
  origin_device_id TEXT NOT NULL,
  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status    TEXT NOT NULL DEFAULT 'local'
                   CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE INDEX party_address_party_idx ON party_address (party_id) WHERE deleted_at IS NULL;

CREATE TABLE party_alias (
  id         TEXT PRIMARY KEY,
  party_id   TEXT NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  alias      TEXT NOT NULL CHECK (length(trim(alias)) > 0),
  kind       TEXT CHECK (kind IN ('legal','commercial','informal','transliteration','other')),
  notes      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  origin_device_id TEXT NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE INDEX party_alias_party_idx ON party_alias (party_id) WHERE deleted_at IS NULL;

CREATE TABLE party_relationship (
  id               TEXT PRIMARY KEY,
  from_party_id    TEXT NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  to_party_id      TEXT NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  relation_type_id TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  description      TEXT,
  start_date       TEXT,
  end_date         TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT,
  origin_device_id TEXT NOT NULL,
  revision         INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status      TEXT NOT NULL DEFAULT 'local'
                     CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at   TEXT,
  CHECK (from_party_id <> to_party_id),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
) STRICT;

CREATE INDEX party_relationship_from_idx ON party_relationship (from_party_id) WHERE deleted_at IS NULL;
CREATE INDEX party_relationship_to_idx ON party_relationship (to_party_id) WHERE deleted_at IS NULL;

CREATE TABLE party_interaction (
  id          TEXT PRIMARY KEY,
  party_id    TEXT NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  channel_id  TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  direction   TEXT NOT NULL DEFAULT 'internal'
                CHECK (direction IN ('inbound','outbound','internal')),
  occurred_at TEXT NOT NULL,
  summary     TEXT NOT NULL,
  details     TEXT,
  follow_up_at TEXT,
  file_id     TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  origin_device_id TEXT NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE INDEX party_interaction_party_idx ON party_interaction (party_id, occurred_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE party_snapshot (
  id            TEXT PRIMARY KEY,
  party_id      TEXT NOT NULL REFERENCES party(id) ON DELETE CASCADE,
  captured_at   TEXT NOT NULL,
  reason        TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL CHECK (length(snapshot_hash) = 64),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  origin_device_id TEXT NOT NULL,
  revision      INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status   TEXT NOT NULL DEFAULT 'local'
                  CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE INDEX party_snapshot_party_idx ON party_snapshot (party_id, captured_at);

-- ============================================================================
-- 3. COURTS, FILES, CASES, FILE/CASE LINKS, PARTY ROLES
-- ============================================================================

CREATE TABLE court (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL CHECK (length(trim(name)) > 0),
  court_kind_id  TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  parent_id      TEXT REFERENCES court(id) ON DELETE RESTRICT,
  governorate_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  address        TEXT,
  phone          TEXT,
  notes          TEXT,
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT,
  archived_at    TEXT,
  origin_device_id TEXT NOT NULL,
  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status    TEXT NOT NULL DEFAULT 'local'
                   CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT,
  CHECK (parent_id IS NULL OR parent_id <> id)
) STRICT;

CREATE INDEX court_name_idx ON court (name) WHERE deleted_at IS NULL;
CREATE INDEX court_parent_idx ON court (parent_id);

CREATE TABLE court_circuit (
  id         TEXT PRIMARY KEY,
  court_id   TEXT NOT NULL REFERENCES court(id) ON DELETE RESTRICT,
  name       TEXT NOT NULL CHECK (length(trim(name)) > 0),
  location   TEXT,
  notes      TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  origin_device_id TEXT NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE UNIQUE INDEX court_circuit_name_uq ON court_circuit (court_id, name)
  WHERE deleted_at IS NULL;
CREATE INDEX court_circuit_court_idx ON court_circuit (court_id) WHERE deleted_at IS NULL;

CREATE TABLE case_file (
  id                TEXT PRIMARY KEY,
  file_number       TEXT NOT NULL UNIQUE CHECK (length(trim(file_number)) > 0),
  title             TEXT NOT NULL CHECK (length(trim(title)) > 0),
  file_type_id      TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  practice_area_id  TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  status_id         TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  priority_id       TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  confidentiality_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  responsible_party_id TEXT REFERENCES party(id) ON DELETE RESTRICT,
  parent_file_id    TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  root_file_id      TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  opened_on         TEXT NOT NULL,
  closed_on         TEXT,
  description       TEXT,
  archived_at       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT,
  origin_device_id  TEXT NOT NULL,
  revision          INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status       TEXT NOT NULL DEFAULT 'local'
                      CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at    TEXT,
  CHECK (parent_file_id IS NULL OR parent_file_id <> id),
  CHECK (closed_on IS NULL OR closed_on >= opened_on)
) STRICT;

CREATE INDEX case_file_parent_idx ON case_file (parent_file_id) WHERE deleted_at IS NULL;
CREATE INDEX case_file_root_idx ON case_file (root_file_id) WHERE deleted_at IS NULL;
CREATE INDEX case_file_title_idx ON case_file (title) WHERE deleted_at IS NULL;
CREATE INDEX case_file_status_idx ON case_file (status_id, opened_on DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX case_file_practice_idx ON case_file (practice_area_id, opened_on DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE case_file_link (
  id              TEXT PRIMARY KEY,
  source_file_id  TEXT NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  target_file_id  TEXT NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  relation_type_id TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  origin_device_id TEXT NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status     TEXT NOT NULL DEFAULT 'local'
                    CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at  TEXT,
  CHECK (source_file_id <> target_file_id)
) STRICT;

CREATE UNIQUE INDEX case_file_link_uq
  ON case_file_link (source_file_id, target_file_id, relation_type_id)
  WHERE deleted_at IS NULL;
CREATE INDEX case_file_link_target_idx ON case_file_link (target_file_id) WHERE deleted_at IS NULL;

CREATE TABLE legal_case (
  id                  TEXT PRIMARY KEY,
  court_id            TEXT REFERENCES court(id) ON DELETE RESTRICT,
  circuit_id          TEXT REFERENCES court_circuit(id) ON DELETE RESTRICT,
  case_number         TEXT NOT NULL CHECK (length(trim(case_number)) > 0),
  case_year           INTEGER NOT NULL CHECK (case_year BETWEEN 1900 AND 2200),
  case_type_id        TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  litigation_degree_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  status_id           TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  registration_date   TEXT,
  subject             TEXT,
  claim_amount_minor  INTEGER CHECK (claim_amount_minor IS NULL OR claim_amount_minor >= 0),
  currency_code       TEXT REFERENCES currency(code) ON DELETE RESTRICT,
  notes               TEXT,
  archived_at         TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT,
  origin_device_id    TEXT NOT NULL,
  revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status         TEXT NOT NULL DEFAULT 'local'
                        CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at      TEXT,
  CHECK (circuit_id IS NULL OR court_id IS NOT NULL)
) STRICT;

CREATE UNIQUE INDEX legal_case_number_uq
  ON legal_case (court_id, case_number, case_year)
  WHERE court_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX legal_case_court_idx ON legal_case (court_id) WHERE deleted_at IS NULL;
CREATE INDEX legal_case_status_idx ON legal_case (status_id) WHERE deleted_at IS NULL;

CREATE TABLE case_file_case (
  id              TEXT PRIMARY KEY,
  file_id         TEXT NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  case_id         TEXT NOT NULL REFERENCES legal_case(id) ON DELETE CASCADE,
  relation_type_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  is_primary      INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  origin_device_id TEXT NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status     TEXT NOT NULL DEFAULT 'local'
                    CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at  TEXT
) STRICT;

CREATE UNIQUE INDEX case_file_case_uq ON case_file_case (file_id, case_id)
  WHERE deleted_at IS NULL;
CREATE INDEX case_file_case_case_idx ON case_file_case (case_id) WHERE deleted_at IS NULL;

CREATE TABLE case_file_party (
  id         TEXT PRIMARY KEY,
  file_id    TEXT NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  case_id    TEXT REFERENCES legal_case(id) ON DELETE CASCADE,
  party_id   TEXT NOT NULL REFERENCES party(id) ON DELETE RESTRICT,
  role_id    TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  side_id    TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  ordinal    INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  start_date TEXT,
  end_date   TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  origin_device_id TEXT NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT,
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
) STRICT;

CREATE INDEX case_file_party_file_idx ON case_file_party (file_id, ordinal)
  WHERE deleted_at IS NULL;
CREATE INDEX case_file_party_case_idx ON case_file_party (case_id, role_id)
  WHERE deleted_at IS NULL;
CREATE INDEX case_file_party_party_idx ON case_file_party (party_id) WHERE deleted_at IS NULL;

CREATE TABLE legal_case_link (
  id             TEXT PRIMARY KEY,
  source_case_id TEXT NOT NULL REFERENCES legal_case(id) ON DELETE CASCADE,
  target_case_id TEXT NOT NULL REFERENCES legal_case(id) ON DELETE CASCADE,
  relation_type_id TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT,
  origin_device_id TEXT NOT NULL,
  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status    TEXT NOT NULL DEFAULT 'local'
                   CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT,
  CHECK (source_case_id <> target_case_id)
) STRICT;

CREATE UNIQUE INDEX legal_case_link_uq
  ON legal_case_link (source_case_id, target_case_id, relation_type_id)
  WHERE deleted_at IS NULL;
CREATE INDEX legal_case_link_target_idx ON legal_case_link (target_case_id)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. HEARINGS, JUDGMENTS, NOTES, TASKS
-- ============================================================================

CREATE TABLE hearing (
  id                 TEXT PRIMARY KEY,
  case_id            TEXT NOT NULL REFERENCES legal_case(id) ON DELETE RESTRICT,
  court_id           TEXT REFERENCES court(id) ON DELETE RESTRICT,
  circuit_id         TEXT REFERENCES court_circuit(id) ON DELETE RESTRICT,
  scheduled_at       TEXT NOT NULL,
  timezone           TEXT NOT NULL DEFAULT 'Africa/Cairo',
  purpose            TEXT,
  status_id          TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  held_at            TEXT,
  outcome_summary    TEXT,
  court_decision     TEXT,
  postponement_reason TEXT,
  required_actions   TEXT,
  next_hearing_id    TEXT REFERENCES hearing(id) ON DELETE SET NULL,
  notes              TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT,
  origin_device_id   TEXT NOT NULL,
  revision           INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status        TEXT NOT NULL DEFAULT 'local'
                       CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at     TEXT,
  CHECK (next_hearing_id IS NULL OR next_hearing_id <> id)
) STRICT;

CREATE INDEX hearing_case_idx ON hearing (case_id, scheduled_at);
CREATE INDEX hearing_schedule_idx ON hearing (scheduled_at) WHERE deleted_at IS NULL;
CREATE INDEX hearing_status_idx ON hearing (status_id) WHERE deleted_at IS NULL;

CREATE TABLE judgment (
  id                  TEXT PRIMARY KEY,
  case_id             TEXT NOT NULL REFERENCES legal_case(id) ON DELETE RESTRICT,
  hearing_id          TEXT REFERENCES hearing(id) ON DELETE RESTRICT,
  court_id            TEXT REFERENCES court(id) ON DELETE RESTRICT,
  judgment_number     TEXT,
  issued_on           TEXT NOT NULL,
  judgment_type_id    TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  status_id           TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  operative_part      TEXT,
  reasoning           TEXT,
  deposit_date        TEXT,
  copy_received_on    TEXT,
  user_appeal_deadline TEXT,
  appeal_notes        TEXT,
  notes               TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  deleted_at          TEXT,
  origin_device_id    TEXT NOT NULL,
  revision            INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status         TEXT NOT NULL DEFAULT 'local'
                        CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at      TEXT
) STRICT;

CREATE INDEX judgment_case_idx ON judgment (case_id, issued_on DESC);
CREATE INDEX judgment_issued_idx ON judgment (issued_on) WHERE deleted_at IS NULL;

CREATE TABLE judgment_file_link (
  id          TEXT PRIMARY KEY,
  judgment_id TEXT NOT NULL REFERENCES judgment(id) ON DELETE CASCADE,
  file_id     TEXT NOT NULL REFERENCES case_file(id) ON DELETE CASCADE,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  origin_device_id TEXT NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE UNIQUE INDEX judgment_file_link_uq ON judgment_file_link (judgment_id, file_id)
  WHERE deleted_at IS NULL;
CREATE INDEX judgment_file_link_file_idx ON judgment_file_link (file_id) WHERE deleted_at IS NULL;

CREATE TABLE judgment_appeal (
  id               TEXT PRIMARY KEY,
  judgment_id      TEXT NOT NULL REFERENCES judgment(id) ON DELETE RESTRICT,
  appeal_type_id   TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  filed_on         TEXT,
  user_deadline_on TEXT,
  status_id        TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  reference_no     TEXT,
  notes            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT,
  origin_device_id TEXT NOT NULL,
  revision         INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status      TEXT NOT NULL DEFAULT 'local'
                     CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at   TEXT
) STRICT;

CREATE INDEX judgment_appeal_judgment_idx ON judgment_appeal (judgment_id) WHERE deleted_at IS NULL;

CREATE TABLE case_note (
  id         TEXT PRIMARY KEY,
  file_id    TEXT NOT NULL REFERENCES case_file(id) ON DELETE RESTRICT,
  case_id    TEXT REFERENCES legal_case(id) ON DELETE RESTRICT,
  body       TEXT NOT NULL CHECK (length(trim(body)) > 0),
  is_private INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  origin_device_id TEXT NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE INDEX case_note_file_idx ON case_note (file_id, created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE task (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description     TEXT,
  task_type_id    TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  status_id       TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  priority_id     TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  file_id         TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  case_id         TEXT REFERENCES legal_case(id) ON DELETE RESTRICT,
  hearing_id      TEXT REFERENCES hearing(id) ON DELETE RESTRICT,
  judgment_id     TEXT REFERENCES judgment(id) ON DELETE RESTRICT,
  client_party_id TEXT REFERENCES party(id) ON DELETE RESTRICT,
  assignee_party_id TEXT REFERENCES party(id) ON DELETE RESTRICT,
  parent_task_id  TEXT REFERENCES task(id) ON DELETE RESTRICT,
  due_at          TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  cancelled_at    TEXT,
  suspension_reason TEXT,
  result_summary  TEXT,
  notes           TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  origin_device_id TEXT NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status     TEXT NOT NULL DEFAULT 'local'
                    CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at  TEXT,
  CHECK (parent_task_id IS NULL OR parent_task_id <> id)
) STRICT;

CREATE INDEX task_status_due_idx ON task (status_id, due_at) WHERE deleted_at IS NULL;
CREATE INDEX task_file_idx ON task (file_id) WHERE deleted_at IS NULL;
CREATE INDEX task_case_idx ON task (case_id) WHERE deleted_at IS NULL;
CREATE INDEX task_assignee_idx ON task (assignee_party_id, status_id) WHERE deleted_at IS NULL;
CREATE INDEX task_due_idx ON task (due_at) WHERE deleted_at IS NULL;

CREATE TABLE task_status_history (
  id              TEXT PRIMARY KEY,
  task_id         TEXT NOT NULL REFERENCES task(id) ON DELETE CASCADE,
  from_status_id  TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  to_status_id    TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  changed_at      TEXT NOT NULL,
  changed_by_device_id TEXT NOT NULL,
  note            TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  origin_device_id TEXT NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status     TEXT NOT NULL DEFAULT 'local'
                    CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at  TEXT
) STRICT;

CREATE INDEX task_status_history_task_idx ON task_status_history (task_id, changed_at);

-- ============================================================================
-- 5. ADMINISTRATIVE WORK, APPOINTMENTS, REMINDERS
-- ============================================================================

CREATE TABLE announcement (
  id                 TEXT PRIMARY KEY,
  task_id            TEXT REFERENCES task(id) ON DELETE RESTRICT,
  kind_id            TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  recipient_party_id TEXT REFERENCES party(id) ON DELETE RESTRICT,
  method_id          TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  served_on          TEXT,
  publication        TEXT,
  proof_document_id  TEXT REFERENCES document(id) ON DELETE RESTRICT,
  status_id          TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  notes              TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT,
  origin_device_id   TEXT NOT NULL,
  revision           INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status        TEXT NOT NULL DEFAULT 'local'
                       CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at     TEXT
) STRICT;

CREATE INDEX announcement_task_idx ON announcement (task_id) WHERE deleted_at IS NULL;

CREATE TABLE appointment (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL CHECK (length(trim(title)) > 0),
  kind_id    TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  status_id  TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  start_at   TEXT NOT NULL,
  end_at     TEXT,
  all_day    INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0,1)),
  timezone   TEXT NOT NULL DEFAULT 'Africa/Cairo',
  location   TEXT,
  party_id   TEXT REFERENCES party(id) ON DELETE RESTRICT,
  file_id    TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  case_id    TEXT REFERENCES legal_case(id) ON DELETE RESTRICT,
  task_id    TEXT REFERENCES task(id) ON DELETE RESTRICT,
  notes      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  origin_device_id TEXT NOT NULL,
  revision   INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT,
  CHECK (end_at IS NULL OR end_at >= start_at)
) STRICT;

CREATE INDEX appointment_start_idx ON appointment (start_at) WHERE deleted_at IS NULL;
CREATE INDEX appointment_file_idx ON appointment (file_id, start_at) WHERE deleted_at IS NULL;

CREATE TABLE reminder (
  id         TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  remind_at  TEXT NOT NULL,
  message    TEXT,
  is_dismissed INTEGER NOT NULL DEFAULT 0 CHECK (is_dismissed IN (0,1)),
  dismissed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX reminder_due_idx ON reminder (remind_at) WHERE is_dismissed = 0;

-- ============================================================================
-- 6. DOCUMENTS, CONTRACTS, POWERS OF ATTORNEY
-- ============================================================================

CREATE TABLE document (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL CHECK (length(trim(title)) > 0),
  doc_type_id       TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  doc_number        TEXT,
  doc_date          TEXT,
  source_party_id   TEXT REFERENCES party(id) ON DELETE RESTRICT,
  content_state     TEXT NOT NULL DEFAULT 'not_digitized'
                      CHECK (content_state IN
                        ('not_digitized','referenced','pending','stored','failed')),
  physical_location TEXT,
  external_ref      TEXT,
  confidentiality_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  status_id         TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  notes             TEXT,
  archived_at       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  deleted_at        TEXT,
  origin_device_id  TEXT NOT NULL,
  revision          INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status       TEXT NOT NULL DEFAULT 'local'
                      CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at    TEXT
) STRICT;

CREATE INDEX document_title_idx ON document (title) WHERE deleted_at IS NULL;
CREATE INDEX document_number_idx ON document (doc_number) WHERE deleted_at IS NULL;
CREATE INDEX document_date_idx ON document (doc_date) WHERE deleted_at IS NULL;

CREATE TABLE document_version (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  version_no    INTEGER NOT NULL CHECK (version_no >= 1),
  file_name     TEXT,
  storage_kind  TEXT NOT NULL DEFAULT 'paper'
                  CHECK (storage_kind IN ('local_file','external_reference','paper')),
  storage_path  TEXT,
  mime_type     TEXT,
  byte_size     INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  checksum_sha256 TEXT CHECK (checksum_sha256 IS NULL OR length(checksum_sha256) = 64),
  storage_state TEXT NOT NULL DEFAULT 'registered'
                  CHECK (storage_state IN ('registered','stored','verified','missing','failed')),
  verified_at   TEXT,
  notes         TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT,
  origin_device_id TEXT NOT NULL,
  revision      INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status   TEXT NOT NULL DEFAULT 'local'
                  CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT,
  UNIQUE (document_id, version_no),
  CHECK (storage_kind <> 'local_file' OR file_name IS NOT NULL)
) STRICT;

CREATE INDEX document_version_doc_idx ON document_version (document_id, version_no)
  WHERE deleted_at IS NULL;

CREATE TABLE document_link (
  id          TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES document(id) ON DELETE CASCADE,
  file_id     TEXT REFERENCES case_file(id) ON DELETE CASCADE,
  case_id     TEXT REFERENCES legal_case(id) ON DELETE CASCADE,
  hearing_id  TEXT REFERENCES hearing(id) ON DELETE CASCADE,
  judgment_id TEXT REFERENCES judgment(id) ON DELETE CASCADE,
  contract_id TEXT REFERENCES contract(id) ON DELETE CASCADE,
  power_of_attorney_id TEXT REFERENCES power_of_attorney(id) ON DELETE CASCADE,
  party_id    TEXT REFERENCES party(id) ON DELETE CASCADE,
  task_id     TEXT REFERENCES task(id) ON DELETE CASCADE,
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  origin_device_id TEXT NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT,
  CHECK ((
    (CASE WHEN file_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN case_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN hearing_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN judgment_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN contract_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN power_of_attorney_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN party_id IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN task_id IS NOT NULL THEN 1 ELSE 0 END)
  ) = 1)
) STRICT;

CREATE INDEX document_link_doc_idx ON document_link (document_id) WHERE deleted_at IS NULL;
CREATE INDEX document_link_file_idx ON document_link (file_id) WHERE deleted_at IS NULL;
CREATE INDEX document_link_case_idx ON document_link (case_id) WHERE deleted_at IS NULL;

CREATE TABLE contract (
  id              TEXT PRIMARY KEY,
  contract_number TEXT,
  title           TEXT NOT NULL CHECK (length(trim(title)) > 0),
  contract_type_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  status_id       TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  signed_on       TEXT,
  start_on        TEXT,
  end_on          TEXT,
  value_minor     INTEGER CHECK (value_minor IS NULL OR value_minor >= 0),
  currency_code   TEXT REFERENCES currency(code) ON DELETE RESTRICT,
  file_id         TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  terms_summary   TEXT,
  notes           TEXT,
  archived_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  deleted_at      TEXT,
  origin_device_id TEXT NOT NULL,
  revision        INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status     TEXT NOT NULL DEFAULT 'local'
                    CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at  TEXT,
  CHECK (end_on IS NULL OR start_on IS NULL OR end_on >= start_on)
) STRICT;

CREATE UNIQUE INDEX contract_number_uq ON contract (contract_number)
  WHERE contract_number IS NOT NULL AND contract_number <> '' AND deleted_at IS NULL;
CREATE INDEX contract_file_idx ON contract (file_id) WHERE deleted_at IS NULL;
CREATE INDEX contract_type_idx ON contract (contract_type_id) WHERE deleted_at IS NULL;

CREATE TABLE contract_party (
  id          TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contract(id) ON DELETE CASCADE,
  party_id    TEXT NOT NULL REFERENCES party(id) ON DELETE RESTRICT,
  role_id     TEXT NOT NULL REFERENCES lookup_item(id) ON DELETE RESTRICT,
  is_primary  INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  notes       TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT,
  origin_device_id TEXT NOT NULL,
  revision    INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status TEXT NOT NULL DEFAULT 'local'
                CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE UNIQUE INDEX contract_party_uq
  ON contract_party (contract_id, party_id, role_id) WHERE deleted_at IS NULL;

CREATE TABLE power_of_attorney (
  id                 TEXT PRIMARY KEY,
  instrument_kind_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  poa_number         TEXT,
  issued_on          TEXT,
  expires_on         TEXT,
  notary_office      TEXT,
  principal_party_id TEXT NOT NULL REFERENCES party(id) ON DELETE RESTRICT,
  agent_party_id     TEXT NOT NULL REFERENCES party(id) ON DELETE RESTRICT,
  scope_text         TEXT,
  status_id          TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  file_id            TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  notes              TEXT,
  archived_at        TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  deleted_at         TEXT,
  origin_device_id   TEXT NOT NULL,
  revision           INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status        TEXT NOT NULL DEFAULT 'local'
                       CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at     TEXT,
  CHECK (principal_party_id <> agent_party_id),
  CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
) STRICT;

CREATE INDEX poa_principal_idx ON power_of_attorney (principal_party_id) WHERE deleted_at IS NULL;
CREATE INDEX poa_agent_idx ON power_of_attorney (agent_party_id) WHERE deleted_at IS NULL;
CREATE INDEX poa_number_idx ON power_of_attorney (poa_number) WHERE deleted_at IS NULL;

-- ============================================================================
-- 7. FINANCE (operational, not a complete accounting/tax system)
-- ============================================================================

CREATE TABLE financial_account (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL CHECK (length(trim(name)) > 0),
  account_kind_id       TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  currency_code         TEXT NOT NULL REFERENCES currency(code) ON DELETE RESTRICT,
  opening_balance_minor INTEGER NOT NULL DEFAULT 0,
  opened_on             TEXT,
  is_active             INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  notes                 TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT,
  origin_device_id      TEXT NOT NULL,
  revision              INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status           TEXT NOT NULL DEFAULT 'local'
                          CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at        TEXT
) STRICT;

CREATE TABLE fee_agreement (
  id               TEXT PRIMARY KEY,
  client_party_id  TEXT NOT NULL REFERENCES party(id) ON DELETE RESTRICT,
  file_id          TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  contract_id      TEXT REFERENCES contract(id) ON DELETE RESTRICT,
  agreement_type_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  status_id        TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  title            TEXT NOT NULL CHECK (length(trim(title)) > 0),
  total_amount_minor INTEGER NOT NULL CHECK (total_amount_minor >= 0),
  currency_code    TEXT NOT NULL REFERENCES currency(code) ON DELETE RESTRICT,
  start_on         TEXT,
  due_on           TEXT,
  terms            TEXT,
  notes            TEXT,
  archived_at      TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT,
  origin_device_id TEXT NOT NULL,
  revision         INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status      TEXT NOT NULL DEFAULT 'local'
                     CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at   TEXT
) STRICT;

CREATE INDEX fee_agreement_client_idx ON fee_agreement (client_party_id) WHERE deleted_at IS NULL;
CREATE INDEX fee_agreement_file_idx ON fee_agreement (file_id) WHERE deleted_at IS NULL;

CREATE TABLE financial_charge (
  id               TEXT PRIMARY KEY,
  client_party_id  TEXT NOT NULL REFERENCES party(id) ON DELETE RESTRICT,
  file_id          TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  fee_agreement_id TEXT REFERENCES fee_agreement(id) ON DELETE RESTRICT,
  charge_type_id   TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  description      TEXT NOT NULL,
  amount_minor     INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code    TEXT NOT NULL REFERENCES currency(code) ON DELETE RESTRICT,
  issued_on        TEXT NOT NULL,
  due_on           TEXT,
  status_id        TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  notes            TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT,
  origin_device_id TEXT NOT NULL,
  revision         INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status      TEXT NOT NULL DEFAULT 'local'
                     CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at   TEXT,
  CHECK (due_on IS NULL OR due_on >= issued_on)
) STRICT;

CREATE INDEX financial_charge_client_idx ON financial_charge (client_party_id, issued_on DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX financial_charge_file_idx ON financial_charge (file_id) WHERE deleted_at IS NULL;
CREATE INDEX financial_charge_status_idx ON financial_charge (status_id) WHERE deleted_at IS NULL;

CREATE TABLE financial_transaction (
  id               TEXT PRIMARY KEY,
  account_id       TEXT NOT NULL REFERENCES financial_account(id) ON DELETE RESTRICT,
  direction        TEXT NOT NULL CHECK (direction IN ('in','out')),
  transaction_type_id TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  amount_minor     INTEGER NOT NULL CHECK (amount_minor > 0),
  currency_code    TEXT NOT NULL REFERENCES currency(code) ON DELETE RESTRICT,
  occurred_at      TEXT NOT NULL,
  method_id        TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  reference_no     TEXT,
  receipt_no       TEXT,
  client_party_id  TEXT REFERENCES party(id) ON DELETE RESTRICT,
  file_id          TEXT REFERENCES case_file(id) ON DELETE RESTRICT,
  fee_agreement_id TEXT REFERENCES fee_agreement(id) ON DELETE RESTRICT,
  category_id      TEXT REFERENCES lookup_item(id) ON DELETE RESTRICT,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'posted'
                     CHECK (status IN ('posted','void')),
  void_reason      TEXT,
  voided_at        TEXT,
  reverses_transaction_id TEXT REFERENCES financial_transaction(id) ON DELETE RESTRICT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT,
  origin_device_id TEXT NOT NULL,
  revision         INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status      TEXT NOT NULL DEFAULT 'local'
                     CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at   TEXT,
  CHECK (status <> 'void' OR void_reason IS NOT NULL),
  CHECK (reverses_transaction_id IS NULL OR reverses_transaction_id <> id)
) STRICT;

CREATE UNIQUE INDEX financial_transaction_receipt_uq ON financial_transaction (receipt_no)
  WHERE receipt_no IS NOT NULL AND receipt_no <> '' AND deleted_at IS NULL;
CREATE INDEX financial_transaction_account_idx
  ON financial_transaction (account_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX financial_transaction_client_idx
  ON financial_transaction (client_party_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX financial_transaction_file_idx
  ON financial_transaction (file_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX financial_transaction_status_idx ON financial_transaction (status)
  WHERE deleted_at IS NULL;

CREATE TABLE payment_allocation (
  id             TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES financial_transaction(id) ON DELETE RESTRICT,
  charge_id      TEXT NOT NULL REFERENCES financial_charge(id) ON DELETE RESTRICT,
  amount_minor   INTEGER NOT NULL CHECK (amount_minor > 0),
  notes          TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  deleted_at     TEXT,
  origin_device_id TEXT NOT NULL,
  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  sync_status    TEXT NOT NULL DEFAULT 'local'
                   CHECK (sync_status IN ('local','pending','synced','conflict')),
  last_synced_at TEXT
) STRICT;

CREATE UNIQUE INDEX payment_allocation_uq
  ON payment_allocation (transaction_id, charge_id) WHERE deleted_at IS NULL;
CREATE INDEX payment_allocation_charge_idx ON payment_allocation (charge_id) WHERE deleted_at IS NULL;

-- ============================================================================
-- 8. ACTIVITY LOG, DELETION/RESTORE TRAIL, SYNC, SEARCH
-- ============================================================================

CREATE TABLE audit_log (
  id               TEXT PRIMARY KEY,
  occurred_at      TEXT NOT NULL,
  actor_device_id  TEXT NOT NULL,
  action           TEXT NOT NULL CHECK (action IN
                     ('insert','update','delete','restore','archive','unarchive',
                      'transaction_void','migration','backup','restore_backup',
                      'import','identity_rotate','setup')),
  entity_type      TEXT,
  entity_id        TEXT,
  summary          TEXT,
  changes_json     TEXT,
  correlation_id   TEXT
) STRICT;

CREATE INDEX audit_occurred_idx ON audit_log (occurred_at DESC);
CREATE INDEX audit_entity_idx ON audit_log (entity_type, entity_id, occurred_at DESC);

CREATE TABLE deletion_batch (
  id             TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,
  origin_device_id TEXT NOT NULL,
  root_entity_type TEXT NOT NULL,
  root_entity_id TEXT NOT NULL,
  policy         TEXT NOT NULL,
  affected_count INTEGER NOT NULL CHECK (affected_count >= 0),
  restored_at    TEXT
) STRICT;

CREATE TABLE deletion_entry (
  id          TEXT PRIMARY KEY,
  batch_id    TEXT NOT NULL REFERENCES deletion_batch(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('soft_delete','cascade_soft_delete')),
  created_at  TEXT NOT NULL
) STRICT;

CREATE INDEX deletion_entry_batch_idx ON deletion_entry (batch_id);
CREATE INDEX deletion_entry_entity_idx ON deletion_entry (entity_type, entity_id);

CREATE TABLE sync_entity_type (
  code        TEXT PRIMARY KEY,
  table_name  TEXT NOT NULL,
  policy      TEXT NOT NULL CHECK (policy IN
                ('field_merge','relation_set','append_only','immutable','ledger')),
  policy_version INTEGER NOT NULL DEFAULT 1 CHECK (policy_version >= 1),
  description TEXT
) STRICT;

CREATE TABLE sync_outbox (
  id              TEXT PRIMARY KEY,
  sequence        INTEGER NOT NULL UNIQUE,
  entity_type     TEXT NOT NULL REFERENCES sync_entity_type(code) ON DELETE RESTRICT,
  entity_id       TEXT NOT NULL,
  operation       TEXT NOT NULL CHECK (operation IN ('insert','update','delete','restore')),
  payload_json    TEXT NOT NULL,
  changed_fields_json TEXT NOT NULL,
  origin_device_id TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  state           TEXT NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','sending','sent','failed','discarded')),
  attempt_count   INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_attempt_at TEXT,
  last_error      TEXT,
  sent_at         TEXT
) STRICT;

CREATE INDEX sync_outbox_pending_idx ON sync_outbox (state, sequence);
CREATE INDEX sync_outbox_entity_idx ON sync_outbox (entity_type, entity_id, sequence);

CREATE TABLE sync_conflict (
  id                TEXT PRIMARY KEY,
  entity_type       TEXT NOT NULL REFERENCES sync_entity_type(code) ON DELETE RESTRICT,
  entity_id         TEXT NOT NULL,
  base_revision     INTEGER,
  local_revision    INTEGER,
  remote_revision   INTEGER,
  local_device_id   TEXT NOT NULL,
  remote_device_id  TEXT NOT NULL,
  local_payload     TEXT NOT NULL,
  remote_payload    TEXT NOT NULL,
  conflicting_fields_json TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution        TEXT CHECK (resolution IN ('local','remote','merged','manual')),
  resolved_at       TEXT,
  resolved_by_device_id TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (entity_type, entity_id, remote_revision, remote_device_id)
) STRICT;

CREATE INDEX sync_conflict_open_idx ON sync_conflict (status, created_at);

CREATE TABLE search_document (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  body        TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  UNIQUE (entity_type, entity_id)
) STRICT;

CREATE INDEX search_document_entity_idx ON search_document (entity_type);

-- ============================================================================
-- 9. INTEGRITY GUARDS (append-only and financial invariants)
-- ============================================================================

CREATE TRIGGER schema_migration_no_update BEFORE UPDATE ON schema_migration
BEGIN SELECT RAISE(ABORT, 'applied migrations are immutable'); END;
CREATE TRIGGER schema_migration_no_delete BEFORE DELETE ON schema_migration
BEGIN SELECT RAISE(ABORT, 'applied migrations are immutable'); END;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;

CREATE TRIGGER party_snapshot_no_business_update
BEFORE UPDATE OF party_id, captured_at, reason, snapshot_json, snapshot_hash, deleted_at
ON party_snapshot
BEGIN SELECT RAISE(ABORT, 'party snapshots are immutable'); END;
CREATE TRIGGER party_snapshot_no_delete BEFORE DELETE ON party_snapshot
BEGIN SELECT RAISE(ABORT, 'party snapshots are immutable'); END;

CREATE TRIGGER task_status_history_no_business_update
BEFORE UPDATE OF task_id, from_status_id, to_status_id, changed_at, changed_by_device_id,
  note, deleted_at
ON task_status_history
BEGIN SELECT RAISE(ABORT, 'task status history is append-only'); END;

CREATE TRIGGER financial_transaction_no_delete BEFORE DELETE ON financial_transaction
BEGIN SELECT RAISE(ABORT, 'financial transactions cannot be deleted; void or reverse them'); END;

CREATE TRIGGER financial_transaction_no_soft_delete
BEFORE UPDATE OF deleted_at ON financial_transaction
WHEN NEW.deleted_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'financial transactions cannot be deleted; void or reverse them'); END;

CREATE TRIGGER financial_transaction_economic_immutable
BEFORE UPDATE OF amount_minor, direction, account_id, currency_code, transaction_type_id,
  occurred_at, reverses_transaction_id, client_party_id, file_id, fee_agreement_id,
  receipt_no
ON financial_transaction
BEGIN
  SELECT RAISE(ABORT, 'posted financial fields are immutable; void or reverse the transaction');
END;

CREATE TRIGGER financial_transaction_void_irreversible
BEFORE UPDATE OF status ON financial_transaction
WHEN OLD.status = 'void' AND NEW.status <> 'void'
BEGIN SELECT RAISE(ABORT, 'a voided transaction cannot be un-voided; post a new transaction'); END;

CREATE TRIGGER payment_allocation_no_business_update
BEFORE UPDATE OF amount_minor, transaction_id, charge_id, deleted_at ON payment_allocation
BEGIN SELECT RAISE(ABORT, 'payment allocations are immutable'); END;

CREATE TRIGGER payment_allocation_no_delete BEFORE DELETE ON payment_allocation
BEGIN SELECT RAISE(ABORT, 'payment allocations cannot be deleted'); END;

CREATE TRIGGER payment_allocation_validate
BEFORE INSERT ON payment_allocation
WHEN NEW.deleted_at IS NULL
BEGIN
  SELECT CASE
    WHEN (SELECT status FROM financial_transaction WHERE id = NEW.transaction_id) <> 'posted'
      THEN RAISE(ABORT, 'allocation requires a posted transaction')
    WHEN (SELECT direction FROM financial_transaction WHERE id = NEW.transaction_id) <> 'in'
      THEN RAISE(ABORT, 'only incoming payments can be allocated')
    WHEN (SELECT currency_code FROM financial_transaction WHERE id = NEW.transaction_id)
         <> (SELECT currency_code FROM financial_charge WHERE id = NEW.charge_id)
      THEN RAISE(ABORT, 'currency mismatch between payment and charge')
    WHEN NEW.amount_minor >
         (SELECT amount_minor FROM financial_transaction WHERE id = NEW.transaction_id)
      THEN RAISE(ABORT, 'allocation exceeds payment amount')
    WHEN (SELECT COALESCE(SUM(amount_minor), 0) FROM payment_allocation
          WHERE transaction_id = NEW.transaction_id AND deleted_at IS NULL)
         + NEW.amount_minor >
         (SELECT amount_minor FROM financial_transaction WHERE id = NEW.transaction_id)
      THEN RAISE(ABORT, 'allocations exceed payment amount')
    WHEN (SELECT COALESCE(SUM(amount_minor), 0) FROM payment_allocation
          WHERE charge_id = NEW.charge_id AND deleted_at IS NULL)
         + NEW.amount_minor >
         (SELECT amount_minor FROM financial_charge WHERE id = NEW.charge_id)
      THEN RAISE(ABORT, 'allocations exceed charge amount')
  END;
END;

CREATE TRIGGER financial_charge_amount_guard
BEFORE UPDATE OF amount_minor ON financial_charge
WHEN OLD.amount_minor <> NEW.amount_minor
 AND EXISTS (SELECT 1 FROM payment_allocation
             WHERE charge_id = OLD.id AND deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'cannot change a charge amount after payments were allocated'); END;

CREATE TRIGGER financial_charge_delete_guard
BEFORE UPDATE OF deleted_at ON financial_charge
WHEN NEW.deleted_at IS NOT NULL
 AND EXISTS (SELECT 1 FROM payment_allocation
             WHERE charge_id = OLD.id AND deleted_at IS NULL)
BEGIN SELECT RAISE(ABORT, 'cannot delete a charge with allocated payments'); END;
`;

/**
 * Derived FTS5 structures. They are not part of the canonical relational
 * schema: a platform without FTS5 uses the LIKE fallback against
 * `search_document.normalized_text`, and a later platform can rebuild them.
 * This is why they live outside migration checksums and are recreated by
 * SearchService when the engine supports FTS5.
 */
export const SEARCH_FTS_DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  title,
  subtitle,
  body,
  entity_type UNINDEXED,
  content='search_document',
  content_rowid='id',
  tokenize="unicode61 remove_diacritics 2"
);

CREATE TRIGGER IF NOT EXISTS search_document_ai AFTER INSERT ON search_document BEGIN
  INSERT INTO search_fts(rowid, title, subtitle, body, entity_type)
  VALUES (new.id, new.title, new.subtitle, new.body, new.entity_type);
END;

CREATE TRIGGER IF NOT EXISTS search_document_ad AFTER DELETE ON search_document BEGIN
  INSERT INTO search_fts(search_fts, rowid, title, subtitle, body, entity_type)
  VALUES ('delete', old.id, old.title, old.subtitle, old.body, old.entity_type);
END;

CREATE TRIGGER IF NOT EXISTS search_document_au AFTER UPDATE ON search_document BEGIN
  INSERT INTO search_fts(search_fts, rowid, title, subtitle, body, entity_type)
  VALUES ('delete', old.id, old.title, old.subtitle, old.body, old.entity_type);
  INSERT INTO search_fts(rowid, title, subtitle, body, entity_type)
  VALUES (new.id, new.title, new.subtitle, new.body, new.entity_type);
END;
`;

export const SEARCH_FTS_DROP = `
DROP TRIGGER IF EXISTS search_document_au;
DROP TRIGGER IF EXISTS search_document_ad;
DROP TRIGGER IF EXISTS search_document_ai;
DROP TABLE IF EXISTS search_fts;
`;
