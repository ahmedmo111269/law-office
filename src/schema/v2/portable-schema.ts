/**
 * GENERATED FILE — do not edit by hand.
 * Source: migrated schema v2 (SQLite 3.51.3).
 * Regenerate: node --disable-warning=ExperimentalWarning scripts/gen-portable-schema.ts
 *
 * This descriptor is the engine-neutral schema used by the IndexedDB profile
 * and by the portable constraint engine. CHECK expressions are copied verbatim
 * from the DDL and evaluated by src/portable/expression.ts.
 */
import type { PortableSchema } from '../portable-types.ts';

export const PORTABLE_SCHEMA: PortableSchema = {
  "schemaVersion": 2,
  "applicationId": 1279350607,
  "tables": [
    {
      "name": "announcement",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "task_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "task",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "kind_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "recipient_party_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "method_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "served_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "publication",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "proof_document_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "document",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "announcement_task_idx",
          "columns": [
            "task_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_announcement_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "proof_document_id"
          ],
          "referencedTable": "document",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "method_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "recipient_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "kind_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "task_id"
          ],
          "referencedTable": "task",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "app_meta",
      "columns": [
        {
          "name": "key",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "value",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "key"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_app_meta_1",
          "columns": [
            "key"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "appointment",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "title",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "kind_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "start_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "end_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "all_day",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "timezone",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "Africa/Cairo",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "location",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "task_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "task",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "stage_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "procedural_stage",
            "column": "id"
          },
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "appointment_file_idx",
          "columns": [
            "file_id",
            "start_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "appointment_start_idx",
          "columns": [
            "start_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_appointment_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "stage_id"
          ],
          "referencedTable": "procedural_stage",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "task_id"
          ],
          "referencedTable": "task",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "kind_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(title)) > 0",
          "column": "title"
        },
        {
          "expression": "all_day IN (0,1)",
          "column": "all_day"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "end_at IS NULL OR end_at >= start_at",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "audit_log",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "occurred_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "actor_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "action",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "entity_type",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "entity_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "summary",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "changes_json",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "correlation_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "audit_entity_idx",
          "columns": [
            "entity_type",
            "entity_id",
            "occurred_at"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "audit_occurred_idx",
          "columns": [
            "occurred_at"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_audit_log_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [
        {
          "expression": "action IN\n                     ('insert','update','delete','restore','archive','unarchive',\n                      'transaction_void','migration','backup','restore_backup',\n                      'import','identity_rotate','setup')",
          "column": "action"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "case_file",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "file_number",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "title",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "file_type_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "practice_area_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "priority_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "confidentiality_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "responsible_party_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "parent_file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "root_file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "opened_on",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "closed_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "case_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "subtype_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "nature_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "subject",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "facts",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "requests",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "office_capacity",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "dispute_started_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_action_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "next_action",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "follow_up_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "internal_notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "specialized_json",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "{}",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "template_snapshot_json",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "{}",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "intake_enabled",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "case_file_responsible_idx",
          "columns": [
            "responsible_party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_nature_idx",
          "columns": [
            "nature_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_subtype_idx",
          "columns": [
            "subtype_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_type_idx",
          "columns": [
            "case_type_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_practice_idx",
          "columns": [
            "practice_area_id",
            "opened_on"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_status_idx",
          "columns": [
            "status_id",
            "opened_on"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_title_idx",
          "columns": [
            "title"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_root_idx",
          "columns": [
            "root_file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_parent_idx",
          "columns": [
            "parent_file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_case_file_2",
          "columns": [
            "file_number"
          ],
          "unique": true,
          "where": null
        },
        {
          "name": "sqlite_autoindex_case_file_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "nature_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "subtype_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "root_file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "parent_file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "responsible_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "confidentiality_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "priority_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "practice_area_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "file_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(file_number)) > 0",
          "column": "file_number"
        },
        {
          "expression": "length(trim(title)) > 0",
          "column": "title"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "intake_enabled IN (0,1)",
          "column": "intake_enabled"
        },
        {
          "expression": "parent_file_id IS NULL OR parent_file_id <> id",
          "column": null
        },
        {
          "expression": "closed_on IS NULL OR closed_on >= opened_on",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "case_file_case",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "relation_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "is_primary",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "case_file_case_case_idx",
          "columns": [
            "case_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_case_uq",
          "columns": [
            "file_id",
            "case_id"
          ],
          "unique": true,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_case_file_case_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "relation_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "is_primary IN (0,1)",
          "column": "is_primary"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "case_file_link",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "source_file_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "target_file_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "relation_type_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "case_file_link_target_idx",
          "columns": [
            "target_file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_link_uq",
          "columns": [
            "source_file_id",
            "target_file_id",
            "relation_type_id"
          ],
          "unique": true,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_case_file_link_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "relation_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "target_file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "source_file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "source_file_id <> target_file_id",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "case_file_party",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "role_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "side_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "ordinal",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_primary",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "start_date",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "end_date",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_office_client",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "case_party_role_page_idx",
          "columns": [
            "role_id",
            "id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "case_party_person_page_idx",
          "columns": [
            "party_id",
            "id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "case_file_party_role_idx",
          "columns": [
            "role_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_party_party_idx",
          "columns": [
            "party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_party_case_idx",
          "columns": [
            "case_id",
            "role_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_file_party_file_idx",
          "columns": [
            "file_id",
            "ordinal"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_case_file_party_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "side_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "role_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "is_primary IN (0,1)",
          "column": "is_primary"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "is_office_client IN (0,1)",
          "column": "is_office_client"
        },
        {
          "expression": "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "case_note",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "body",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_private",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "case_note_file_idx",
          "columns": [
            "file_id",
            "created_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_case_note_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(body)) > 0",
          "column": "body"
        },
        {
          "expression": "is_private IN (0,1)",
          "column": "is_private"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "case_term",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "term_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "case_term_term_idx",
          "columns": [
            "term_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_term_term_page_idx",
          "columns": [
            "term_id",
            "id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_term_file_idx",
          "columns": [
            "file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "case_term_case_uq",
          "columns": [
            "case_id",
            "term_id"
          ],
          "unique": true,
          "where": "deleted_at IS NULL AND case_id IS NOT NULL"
        },
        {
          "name": "case_term_file_uq",
          "columns": [
            "file_id",
            "term_id"
          ],
          "unique": true,
          "where": "deleted_at IS NULL AND case_id IS NULL"
        },
        {
          "name": "sqlite_autoindex_case_term_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "term_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "client_profile",
      "columns": [
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "client_code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "client_since",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "source_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "party_id"
      ],
      "indexes": [
        {
          "name": "client_profile_status_idx",
          "columns": [
            "status_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_client_profile_2",
          "columns": [
            "client_code"
          ],
          "unique": true,
          "where": null
        },
        {
          "name": "sqlite_autoindex_client_profile_1",
          "columns": [
            "party_id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "source_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "contract",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "contract_number",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "title",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "contract_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "signed_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "start_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "end_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "value_minor",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "currency_code",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "currency",
            "column": "code"
          },
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "terms_summary",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "contract_type_idx",
          "columns": [
            "contract_type_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "contract_file_idx",
          "columns": [
            "file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "contract_number_uq",
          "columns": [
            "contract_number"
          ],
          "unique": true,
          "where": "contract_number IS NOT NULL AND contract_number <> '' AND deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_contract_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "currency_code"
          ],
          "referencedTable": "currency",
          "referencedColumns": [
            "code"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "contract_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(title)) > 0",
          "column": "title"
        },
        {
          "expression": "value_minor IS NULL OR value_minor >= 0",
          "column": "value_minor"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "end_on IS NULL OR start_on IS NULL OR end_on >= start_on",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "contract_party",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "contract_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "contract",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "role_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "is_primary",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "contract_party_uq",
          "columns": [
            "contract_id",
            "party_id",
            "role_id"
          ],
          "unique": true,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_contract_party_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "role_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "contract_id"
          ],
          "referencedTable": "contract",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "is_primary IN (0,1)",
          "column": "is_primary"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "court",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "court_kind_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "parent_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "court",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "governorate_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "address",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "phone",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_active",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "aliases_json",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "[]",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "level_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "court_parent_idx",
          "columns": [
            "parent_id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "court_name_idx",
          "columns": [
            "name"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_court_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "level_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "governorate_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "parent_id"
          ],
          "referencedTable": "court",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "court_kind_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(name)) > 0",
          "column": "name"
        },
        {
          "expression": "is_active IN (0,1)",
          "column": "is_active"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "parent_id IS NULL OR parent_id <> id",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "court_circuit",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "court_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "court",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "location",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_active",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "court_circuit_court_idx",
          "columns": [
            "court_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "court_circuit_name_uq",
          "columns": [
            "court_id",
            "name"
          ],
          "unique": true,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_court_circuit_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "court_id"
          ],
          "referencedTable": "court",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(name)) > 0",
          "column": "name"
        },
        {
          "expression": "is_active IN (0,1)",
          "column": "is_active"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "currency",
      "columns": [
        {
          "name": "code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "name_ar",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "name_en",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "symbol",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "minor_units",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 2,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_active",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "code"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_currency_1",
          "columns": [
            "code"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [
        {
          "expression": "length(code) = 3",
          "column": "code"
        },
        {
          "expression": "minor_units BETWEEN 0 AND 4",
          "column": "minor_units"
        },
        {
          "expression": "is_active IN (0,1)",
          "column": "is_active"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "deletion_batch",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "root_entity_type",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "root_entity_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "policy",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "affected_count",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "restored_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_deletion_batch_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [
        {
          "expression": "affected_count >= 0",
          "column": "affected_count"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "deletion_entry",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "batch_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "deletion_batch",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "entity_type",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "entity_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "action",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "deletion_entry_entity_idx",
          "columns": [
            "entity_type",
            "entity_id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "deletion_entry_batch_idx",
          "columns": [
            "batch_id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_deletion_entry_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "batch_id"
          ],
          "referencedTable": "deletion_batch",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "action IN ('soft_delete','cascade_soft_delete')",
          "column": "action"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "device_setting",
      "columns": [
        {
          "name": "device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": {
            "table": "local_device",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "key",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 2,
          "references": null,
          "unique": false
        },
        {
          "name": "value",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "value_type",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "device_id",
        "key"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_device_setting_1",
          "columns": [
            "device_id",
            "key"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "device_id"
          ],
          "referencedTable": "local_device",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "value_type IN ('string','number','boolean','json')",
          "column": "value_type"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "document",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "title",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "doc_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "doc_number",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "doc_date",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "source_party_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "content_state",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "not_digitized",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "physical_location",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "external_ref",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "confidentiality_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "document_date_idx",
          "columns": [
            "doc_date"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "document_number_idx",
          "columns": [
            "doc_number"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "document_title_idx",
          "columns": [
            "title"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_document_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "confidentiality_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "source_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "doc_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(title)) > 0",
          "column": "title"
        },
        {
          "expression": "content_state IN\n                        ('not_digitized','referenced','pending','stored','failed')",
          "column": "content_state"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "document_link",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "document_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "document",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "hearing_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "hearing",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "judgment_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "judgment",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "contract_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "contract",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "power_of_attorney_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "power_of_attorney",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "task_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "task",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "stage_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "procedural_stage",
            "column": "id"
          },
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "document_link_stage_idx",
          "columns": [
            "stage_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "document_link_case_idx",
          "columns": [
            "case_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "document_link_file_idx",
          "columns": [
            "file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "document_link_doc_idx",
          "columns": [
            "document_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_document_link_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "stage_id"
          ],
          "referencedTable": "procedural_stage",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "task_id"
          ],
          "referencedTable": "task",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "power_of_attorney_id"
          ],
          "referencedTable": "power_of_attorney",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "contract_id"
          ],
          "referencedTable": "contract",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "judgment_id"
          ],
          "referencedTable": "judgment",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "hearing_id"
          ],
          "referencedTable": "hearing",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "document_id"
          ],
          "referencedTable": "document",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "(\n    (CASE WHEN file_id IS NOT NULL THEN 1 ELSE 0 END) +\n    (CASE WHEN case_id IS NOT NULL THEN 1 ELSE 0 END) +\n    (CASE WHEN hearing_id IS NOT NULL THEN 1 ELSE 0 END) +\n    (CASE WHEN judgment_id IS NOT NULL THEN 1 ELSE 0 END) +\n    (CASE WHEN contract_id IS NOT NULL THEN 1 ELSE 0 END) +\n    (CASE WHEN power_of_attorney_id IS NOT NULL THEN 1 ELSE 0 END) +\n    (CASE WHEN party_id IS NOT NULL THEN 1 ELSE 0 END) +\n    (CASE WHEN task_id IS NOT NULL THEN 1 ELSE 0 END)\n  ) = 1",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "document_version",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "document_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "document",
            "column": "id"
          },
          "unique": true
        },
        {
          "name": "version_no",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "file_name",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "storage_kind",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "paper",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "storage_path",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "mime_type",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "byte_size",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "checksum_sha256",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "storage_state",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "registered",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "verified_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "document_version_doc_idx",
          "columns": [
            "document_id",
            "version_no"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_document_version_2",
          "columns": [
            "document_id",
            "version_no"
          ],
          "unique": true,
          "where": null
        },
        {
          "name": "sqlite_autoindex_document_version_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "document_id"
          ],
          "referencedTable": "document",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "version_no >= 1",
          "column": "version_no"
        },
        {
          "expression": "storage_kind IN ('local_file','external_reference','paper')",
          "column": "storage_kind"
        },
        {
          "expression": "byte_size IS NULL OR byte_size >= 0",
          "column": "byte_size"
        },
        {
          "expression": "checksum_sha256 IS NULL OR length(checksum_sha256) = 64",
          "column": "checksum_sha256"
        },
        {
          "expression": "storage_state IN ('registered','stored','verified','missing','failed')",
          "column": "storage_state"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "storage_kind <> 'local_file' OR file_name IS NOT NULL",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "fee_agreement",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "client_party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "contract_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "contract",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "agreement_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "title",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "total_amount_minor",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "currency_code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "currency",
            "column": "code"
          },
          "unique": false
        },
        {
          "name": "start_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "due_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "terms",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "fee_agreement_file_idx",
          "columns": [
            "file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "fee_agreement_client_idx",
          "columns": [
            "client_party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_fee_agreement_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "currency_code"
          ],
          "referencedTable": "currency",
          "referencedColumns": [
            "code"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "agreement_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "contract_id"
          ],
          "referencedTable": "contract",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "client_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(title)) > 0",
          "column": "title"
        },
        {
          "expression": "total_amount_minor >= 0",
          "column": "total_amount_minor"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "financial_account",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "account_kind_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "currency_code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "currency",
            "column": "code"
          },
          "unique": false
        },
        {
          "name": "opening_balance_minor",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "opened_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_active",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_financial_account_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "currency_code"
          ],
          "referencedTable": "currency",
          "referencedColumns": [
            "code"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "account_kind_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(name)) > 0",
          "column": "name"
        },
        {
          "expression": "is_active IN (0,1)",
          "column": "is_active"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "financial_charge",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "client_party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "fee_agreement_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "fee_agreement",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "charge_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "amount_minor",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "currency_code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "currency",
            "column": "code"
          },
          "unique": false
        },
        {
          "name": "issued_on",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "due_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "financial_charge_status_idx",
          "columns": [
            "status_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "financial_charge_file_idx",
          "columns": [
            "file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "financial_charge_client_idx",
          "columns": [
            "client_party_id",
            "issued_on"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_financial_charge_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "currency_code"
          ],
          "referencedTable": "currency",
          "referencedColumns": [
            "code"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "charge_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "fee_agreement_id"
          ],
          "referencedTable": "fee_agreement",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "client_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "amount_minor > 0",
          "column": "amount_minor"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "due_on IS NULL OR due_on >= issued_on",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "financial_transaction",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "account_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "financial_account",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "direction",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "transaction_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "amount_minor",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "currency_code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "currency",
            "column": "code"
          },
          "unique": false
        },
        {
          "name": "occurred_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "method_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "reference_no",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "receipt_no",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "client_party_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "fee_agreement_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "fee_agreement",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "category_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "posted",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "void_reason",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "voided_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "reverses_transaction_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "financial_transaction",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "financial_transaction_status_idx",
          "columns": [
            "status"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "financial_transaction_file_idx",
          "columns": [
            "file_id",
            "occurred_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "financial_transaction_client_idx",
          "columns": [
            "client_party_id",
            "occurred_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "financial_transaction_account_idx",
          "columns": [
            "account_id",
            "occurred_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "financial_transaction_receipt_uq",
          "columns": [
            "receipt_no"
          ],
          "unique": true,
          "where": "receipt_no IS NOT NULL AND receipt_no <> '' AND deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_financial_transaction_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "reverses_transaction_id"
          ],
          "referencedTable": "financial_transaction",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "category_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "fee_agreement_id"
          ],
          "referencedTable": "fee_agreement",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "client_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "method_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "currency_code"
          ],
          "referencedTable": "currency",
          "referencedColumns": [
            "code"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "transaction_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "account_id"
          ],
          "referencedTable": "financial_account",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "direction IN ('in','out')",
          "column": "direction"
        },
        {
          "expression": "amount_minor > 0",
          "column": "amount_minor"
        },
        {
          "expression": "status IN ('posted','void')",
          "column": "status"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "status <> 'void' OR void_reason IS NOT NULL",
          "column": null
        },
        {
          "expression": "reverses_transaction_id IS NULL OR reverses_transaction_id <> id",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "hearing",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "court_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "court",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "circuit_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "court_circuit",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "scheduled_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "timezone",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "Africa/Cairo",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "purpose",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "held_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "outcome_summary",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "court_decision",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "postponement_reason",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "required_actions",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "next_hearing_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "hearing",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "hearing_status_idx",
          "columns": [
            "status_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "hearing_schedule_idx",
          "columns": [
            "scheduled_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "hearing_case_idx",
          "columns": [
            "case_id",
            "scheduled_at"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_hearing_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "next_hearing_id"
          ],
          "referencedTable": "hearing",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "SET NULL"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "circuit_id"
          ],
          "referencedTable": "court_circuit",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "court_id"
          ],
          "referencedTable": "court",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "next_hearing_id IS NULL OR next_hearing_id <> id",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "judgment",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "hearing_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "hearing",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "court_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "court",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "judgment_number",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "issued_on",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "judgment_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "operative_part",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "reasoning",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deposit_date",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "copy_received_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "user_appeal_deadline",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "appeal_notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "judgment_issued_idx",
          "columns": [
            "issued_on"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "judgment_case_idx",
          "columns": [
            "case_id",
            "issued_on"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_judgment_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "judgment_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "court_id"
          ],
          "referencedTable": "court",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "hearing_id"
          ],
          "referencedTable": "hearing",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "judgment_appeal",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "judgment_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "judgment",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "appeal_type_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "filed_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "user_deadline_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "reference_no",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "appeal_case_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "authority_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "court",
            "column": "id"
          },
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "judgment_appeal_judgment_idx",
          "columns": [
            "judgment_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_judgment_appeal_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "authority_id"
          ],
          "referencedTable": "court",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "appeal_case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "appeal_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "judgment_id"
          ],
          "referencedTable": "judgment",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "judgment_file_link",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "judgment_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "judgment",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "judgment_file_link_file_idx",
          "columns": [
            "file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "judgment_file_link_uq",
          "columns": [
            "judgment_id",
            "file_id"
          ],
          "unique": true,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_judgment_file_link_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "judgment_id"
          ],
          "referencedTable": "judgment",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "legal_case",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "court_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "court",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "circuit_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "court_circuit",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "case_number",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "case_year",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "case_type_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "litigation_degree_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "registration_date",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "subject",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "claim_amount_minor",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "currency_code",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "currency",
            "column": "code"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "office_capacity",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "procedural_result",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "legal_case_circuit_idx",
          "columns": [
            "circuit_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "legal_case_degree_idx",
          "columns": [
            "litigation_degree_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "legal_case_type_idx",
          "columns": [
            "case_type_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "legal_case_status_idx",
          "columns": [
            "status_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "legal_case_court_idx",
          "columns": [
            "court_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "legal_case_number_uq",
          "columns": [
            "court_id",
            "case_number",
            "case_year"
          ],
          "unique": true,
          "where": "court_id IS NOT NULL AND deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_legal_case_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "currency_code"
          ],
          "referencedTable": "currency",
          "referencedColumns": [
            "code"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "litigation_degree_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "circuit_id"
          ],
          "referencedTable": "court_circuit",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "court_id"
          ],
          "referencedTable": "court",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(case_number)) > 0",
          "column": "case_number"
        },
        {
          "expression": "case_year BETWEEN 1900 AND 2200",
          "column": "case_year"
        },
        {
          "expression": "claim_amount_minor IS NULL OR claim_amount_minor >= 0",
          "column": "claim_amount_minor"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "circuit_id IS NULL OR court_id IS NOT NULL",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "legal_case_link",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "source_case_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "target_case_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "relation_type_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "legal_case_link_target_idx",
          "columns": [
            "target_case_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "legal_case_link_uq",
          "columns": [
            "source_case_id",
            "target_case_id",
            "relation_type_id"
          ],
          "unique": true,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_legal_case_link_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "relation_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "target_case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "source_case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "source_case_id <> target_case_id",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "local_device",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "label",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "platform",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "short_code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "app_version",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "timezone",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "Africa/Cairo",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_local",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_active",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_local_device_2",
          "columns": [
            "short_code"
          ],
          "unique": true,
          "where": null
        },
        {
          "name": "sqlite_autoindex_local_device_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [
        {
          "expression": "platform IN\n                    ('windows','macos','linux','android','ios','web','system','test','unknown')",
          "column": "platform"
        },
        {
          "expression": "is_local IN (0,1)",
          "column": "is_local"
        },
        {
          "expression": "is_active IN (0,1)",
          "column": "is_active"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "lookup_item",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "list_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_list",
            "column": "id"
          },
          "unique": true
        },
        {
          "name": "code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "name_ar",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "name_en",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sort_order",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "parent_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "is_active",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_system",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "lookup_item_parent_idx",
          "columns": [
            "parent_id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "lookup_item_list_idx",
          "columns": [
            "list_id",
            "is_active",
            "sort_order"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_lookup_item_2",
          "columns": [
            "list_id",
            "code"
          ],
          "unique": true,
          "where": null
        },
        {
          "name": "sqlite_autoindex_lookup_item_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "parent_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "list_id"
          ],
          "referencedTable": "lookup_list",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(code) BETWEEN 1 AND 64",
          "column": "code"
        },
        {
          "expression": "length(trim(name_ar)) > 0",
          "column": "name_ar"
        },
        {
          "expression": "is_active IN (0,1)",
          "column": "is_active"
        },
        {
          "expression": "is_system IN (0,1)",
          "column": "is_system"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "lookup_list",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "name_ar",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "name_en",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_system",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_extensible",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_lookup_list_2",
          "columns": [
            "code"
          ],
          "unique": true,
          "where": null
        },
        {
          "name": "sqlite_autoindex_lookup_list_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [
        {
          "expression": "length(code) BETWEEN 1 AND 64",
          "column": "code"
        },
        {
          "expression": "is_system IN (0,1)",
          "column": "is_system"
        },
        {
          "expression": "is_extensible IN (0,1)",
          "column": "is_extensible"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "migration_failure",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "version",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "failed_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "message",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "details_json",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "backup_path",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_migration_failure_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "number_series",
      "columns": [
        {
          "name": "key",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "scope",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "",
          "primaryKeyOrder": 2,
          "references": null,
          "unique": false
        },
        {
          "name": "prefix",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "suffix",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "format",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "{prefix}{value}{suffix}",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "padding",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 4,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "next_value",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "key",
        "scope"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_number_series_1",
          "columns": [
            "key",
            "scope"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [
        {
          "expression": "padding BETWEEN 0 AND 12",
          "column": "padding"
        },
        {
          "expression": "next_value >= 1",
          "column": "next_value"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "office_profile",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "legal_form",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "address_line",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "city",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "governorate_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "phone",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "email",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "website",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "tax_registration_no",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "commercial_registry_no",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "bar_association_no",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_configured",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_office_profile_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "governorate_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(name)) > 0",
          "column": "name"
        },
        {
          "expression": "is_configured IN (0,1)",
          "column": "is_configured"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "office_setting",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "key",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "value",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "value_type",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_office_setting_2",
          "columns": [
            "key"
          ],
          "unique": true,
          "where": null
        },
        {
          "name": "sqlite_autoindex_office_setting_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [
        {
          "expression": "value_type IN ('string','number','boolean','json')",
          "column": "value_type"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "organization",
      "columns": [
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "legal_name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "trade_name",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "legal_form_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "commercial_registry_no",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "tax_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "established_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "registry_office",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "party_id"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_organization_1",
          "columns": [
            "party_id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "legal_form_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(legal_name)) > 0",
          "column": "legal_name"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "party",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "kind",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "display_name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "party_archived_idx",
          "columns": [
            "archived_at"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "party_status_idx",
          "columns": [
            "status_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "party_kind_idx",
          "columns": [
            "kind"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "party_display_name_idx",
          "columns": [
            "display_name"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_party_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "kind IN ('person','organization')",
          "column": "kind"
        },
        {
          "expression": "length(trim(display_name)) > 0",
          "column": "display_name"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "party_address",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "address_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "country",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "EG",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "governorate_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "city",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "district",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "street",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "building_no",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "floor",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "apartment",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "postal_code",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_primary",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "party_address_party_idx",
          "columns": [
            "party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_party_address_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "governorate_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "address_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "is_primary IN (0,1)",
          "column": "is_primary"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "party_alias",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "alias",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "kind",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "party_alias_party_idx",
          "columns": [
            "party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_party_alias_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(alias)) > 0",
          "column": "alias"
        },
        {
          "expression": "kind IN ('legal','commercial','informal','transliteration','other')",
          "column": "kind"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "party_contact",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "contact_type_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "value",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "label",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_primary",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "verified_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "party_contact_party_idx",
          "columns": [
            "party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "party_contact_unique_idx",
          "columns": [
            "party_id",
            "contact_type_id",
            "value"
          ],
          "unique": true,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_party_contact_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "contact_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(value)) > 0",
          "column": "value"
        },
        {
          "expression": "is_primary IN (0,1)",
          "column": "is_primary"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "party_interaction",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "channel_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "direction",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "internal",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "occurred_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "summary",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "details",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "follow_up_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "party_interaction_party_idx",
          "columns": [
            "party_id",
            "occurred_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_party_interaction_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "channel_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "direction IN ('inbound','outbound','internal')",
          "column": "direction"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "party_relationship",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "from_party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "to_party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "relation_type_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "start_date",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "end_date",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "party_relationship_to_idx",
          "columns": [
            "to_party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "party_relationship_from_idx",
          "columns": [
            "from_party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_party_relationship_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "relation_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "to_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        },
        {
          "columns": [
            "from_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "from_party_id <> to_party_id",
          "column": null
        },
        {
          "expression": "end_date IS NULL OR start_date IS NULL OR end_date >= start_date",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "party_snapshot",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "captured_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "reason",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "snapshot_json",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "snapshot_hash",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "party_snapshot_party_idx",
          "columns": [
            "party_id",
            "captured_at"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_party_snapshot_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "length(snapshot_hash) = 64",
          "column": "snapshot_hash"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "payment_allocation",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "transaction_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "financial_transaction",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "charge_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "financial_charge",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "amount_minor",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "payment_allocation_charge_idx",
          "columns": [
            "charge_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "payment_allocation_uq",
          "columns": [
            "transaction_id",
            "charge_id"
          ],
          "unique": true,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_payment_allocation_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "charge_id"
          ],
          "referencedTable": "financial_charge",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "transaction_id"
          ],
          "referencedTable": "financial_transaction",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "amount_minor > 0",
          "column": "amount_minor"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "person",
      "columns": [
        {
          "name": "party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "first_name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "middle_name",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "national_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "national_id_type",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "birth_date",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "gender",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "nationality",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "marital_status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "occupation",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "death_date",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "party_id"
      ],
      "indexes": [
        {
          "name": "person_national_id_uq",
          "columns": [
            "national_id"
          ],
          "unique": true,
          "where": "national_id IS NOT NULL AND national_id <> ''"
        },
        {
          "name": "sqlite_autoindex_person_1",
          "columns": [
            "party_id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "marital_status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(first_name)) > 0",
          "column": "first_name"
        },
        {
          "expression": "length(trim(last_name)) > 0",
          "column": "last_name"
        },
        {
          "expression": "national_id_type IN\n                    ('national_id','passport','residence','other')",
          "column": "national_id_type"
        },
        {
          "expression": "gender IN ('male','female','unknown')",
          "column": "gender"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "power_of_attorney",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "instrument_kind_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "poa_number",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "issued_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "expires_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notary_office",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "principal_party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "agent_party_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "scope_text",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "poa_number_idx",
          "columns": [
            "poa_number"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "poa_agent_idx",
          "columns": [
            "agent_party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "poa_principal_idx",
          "columns": [
            "principal_party_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_power_of_attorney_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "agent_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "principal_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "instrument_kind_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "principal_party_id <> agent_party_id",
          "column": null
        },
        {
          "expression": "expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "procedural_stage",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "type_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "custom_type",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "authority_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "court",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "authority_name_snapshot",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "reference_number",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "reference_year",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "started_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "submitted_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notified_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "attended_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "decision_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "completed_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "follow_up_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "outcome",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "decision",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "closing_reason",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "previous_stage_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "procedural_stage",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "source_document_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "document",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "data_source",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "procedural_stage_status_idx",
          "columns": [
            "status_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "procedural_stage_type_idx",
          "columns": [
            "type_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "procedural_stage_authority_idx",
          "columns": [
            "authority_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "procedural_stage_previous_idx",
          "columns": [
            "previous_stage_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "procedural_stage_case_idx",
          "columns": [
            "case_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "procedural_stage_file_idx",
          "columns": [
            "file_id",
            "started_on"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_procedural_stage_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "source_document_id"
          ],
          "referencedTable": "document",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "previous_stage_id"
          ],
          "referencedTable": "procedural_stage",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "authority_id"
          ],
          "referencedTable": "court",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "reference_year IS NULL OR reference_year BETWEEN 1900 AND 2200",
          "column": "reference_year"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "previous_stage_id IS NULL OR previous_stage_id <> id",
          "column": null
        },
        {
          "expression": "completed_on IS NULL OR started_on IS NULL OR completed_on >= started_on",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "reminder",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "entity_type",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "entity_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "remind_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "message",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "is_dismissed",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "dismissed_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "reminder_due_idx",
          "columns": [
            "remind_at"
          ],
          "unique": false,
          "where": "is_dismissed = 0"
        },
        {
          "name": "sqlite_autoindex_reminder_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [
        {
          "expression": "is_dismissed IN (0,1)",
          "column": "is_dismissed"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "schema_migration",
      "columns": [
        {
          "name": "version",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "checksum",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "applied_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "execution_ms",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "app_version",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "backup_path",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "version"
      ],
      "indexes": [],
      "foreignKeys": [],
      "checks": [],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "search_document",
      "columns": [
        {
          "name": "id",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "entity_type",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "entity_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "title",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "subtitle",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "body",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "normalized_text",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "case_scope",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "case_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "subtype_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "nature_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "court_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "circuit_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "degree_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "case_year",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "case_number",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "responsible_party_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "priority_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "stage_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "stage_status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "registered_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "judgment_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_action_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "follow_up_on",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "latest_hearing_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "has_hearing",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "has_pre_stage",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "has_related",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "has_appeal",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "has_documents",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "needs_next",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "missing_count",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "archived_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "case_search_file_idx",
          "columns": [
            "file_id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "case_search_stage_recent_idx",
          "columns": [
            "stage_type_id",
            "case_scope",
            "updated_at",
            "id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "case_search_status_recent_idx",
          "columns": [
            "status_id",
            "case_scope",
            "updated_at",
            "id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "case_search_type_recent_idx",
          "columns": [
            "case_type_id",
            "case_scope",
            "updated_at",
            "id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "case_search_recent_idx",
          "columns": [
            "case_scope",
            "updated_at",
            "id"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "case_search_stage_follow_idx",
          "columns": [
            "stage_type_id",
            "stage_status_id",
            "follow_up_on"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "case_search_court_year_idx",
          "columns": [
            "court_id",
            "case_year",
            "case_number"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "case_search_type_status_idx",
          "columns": [
            "case_scope",
            "case_type_id",
            "status_id",
            "last_action_on"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "search_document_entity_idx",
          "columns": [
            "entity_type"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_search_document_1",
          "columns": [
            "entity_type",
            "entity_id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "sync_conflict",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "entity_type",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "sync_entity_type",
            "column": "code"
          },
          "unique": true
        },
        {
          "name": "entity_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "base_revision",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "local_revision",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "remote_revision",
          "type": "INTEGER",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "local_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "remote_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "local_payload",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "remote_payload",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "conflicting_fields_json",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "open",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "resolution",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "resolved_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "resolved_by_device_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "sync_conflict_open_idx",
          "columns": [
            "status",
            "created_at"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_sync_conflict_2",
          "columns": [
            "entity_type",
            "entity_id",
            "remote_revision",
            "remote_device_id"
          ],
          "unique": true,
          "where": null
        },
        {
          "name": "sqlite_autoindex_sync_conflict_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "entity_type"
          ],
          "referencedTable": "sync_entity_type",
          "referencedColumns": [
            "code"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "status IN ('open','resolved')",
          "column": "status"
        },
        {
          "expression": "resolution IN ('local','remote','merged','manual')",
          "column": "resolution"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "sync_entity_type",
      "columns": [
        {
          "name": "code",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "table_name",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "policy",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "policy_version",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "code"
      ],
      "indexes": [
        {
          "name": "sqlite_autoindex_sync_entity_type_1",
          "columns": [
            "code"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [],
      "checks": [
        {
          "expression": "policy IN\n                ('field_merge','relation_set','append_only','immutable','ledger')",
          "column": "policy"
        },
        {
          "expression": "policy_version >= 1",
          "column": "policy_version"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "sync_outbox",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "sequence",
          "type": "INTEGER",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": true
        },
        {
          "name": "entity_type",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "sync_entity_type",
            "column": "code"
          },
          "unique": false
        },
        {
          "name": "entity_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "operation",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "payload_json",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "changed_fields_json",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "state",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "pending",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "attempt_count",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 0,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_attempt_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_error",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sent_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "sync_outbox_entity_idx",
          "columns": [
            "entity_type",
            "entity_id",
            "sequence"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sync_outbox_pending_idx",
          "columns": [
            "state",
            "sequence"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_sync_outbox_2",
          "columns": [
            "sequence"
          ],
          "unique": true,
          "where": null
        },
        {
          "name": "sqlite_autoindex_sync_outbox_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "entity_type"
          ],
          "referencedTable": "sync_entity_type",
          "referencedColumns": [
            "code"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "operation IN ('insert','update','delete','restore')",
          "column": "operation"
        },
        {
          "expression": "state IN ('pending','sending','sent','failed','discarded')",
          "column": "state"
        },
        {
          "expression": "attempt_count >= 0",
          "column": "attempt_count"
        }
      ],
      "syncable": false,
      "appendOnly": false
    },
    {
      "name": "task",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "title",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "description",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "task_type_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "priority_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "file_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "case_file",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "case_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "legal_case",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "hearing_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "hearing",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "judgment_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "judgment",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "client_party_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "assignee_party_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "party",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "parent_task_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "task",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "due_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "started_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "completed_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "cancelled_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "suspension_reason",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "result_summary",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "notes",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "stage_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "procedural_stage",
            "column": "id"
          },
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "task_due_idx",
          "columns": [
            "due_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "task_assignee_idx",
          "columns": [
            "assignee_party_id",
            "status_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "task_case_idx",
          "columns": [
            "case_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "task_file_idx",
          "columns": [
            "file_id"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "task_status_due_idx",
          "columns": [
            "status_id",
            "due_at"
          ],
          "unique": false,
          "where": "deleted_at IS NULL"
        },
        {
          "name": "sqlite_autoindex_task_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "stage_id"
          ],
          "referencedTable": "procedural_stage",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "parent_task_id"
          ],
          "referencedTable": "task",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "assignee_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "client_party_id"
          ],
          "referencedTable": "party",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "judgment_id"
          ],
          "referencedTable": "judgment",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "hearing_id"
          ],
          "referencedTable": "hearing",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "case_id"
          ],
          "referencedTable": "legal_case",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "file_id"
          ],
          "referencedTable": "case_file",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "priority_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "task_type_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        }
      ],
      "checks": [
        {
          "expression": "length(trim(title)) > 0",
          "column": "title"
        },
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        },
        {
          "expression": "parent_task_id IS NULL OR parent_task_id <> id",
          "column": null
        }
      ],
      "syncable": true,
      "appendOnly": false
    },
    {
      "name": "task_status_history",
      "columns": [
        {
          "name": "id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 1,
          "references": null,
          "unique": false
        },
        {
          "name": "task_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": {
            "table": "task",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "from_status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "to_status_id",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": {
            "table": "lookup_item",
            "column": "id"
          },
          "unique": false
        },
        {
          "name": "changed_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "changed_by_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "note",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "created_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "updated_at",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "deleted_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "origin_device_id",
          "type": "TEXT",
          "notNull": true,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "revision",
          "type": "INTEGER",
          "notNull": true,
          "defaultValue": 1,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "sync_status",
          "type": "TEXT",
          "notNull": true,
          "defaultValue": "local",
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        },
        {
          "name": "last_synced_at",
          "type": "TEXT",
          "notNull": false,
          "primaryKeyOrder": 0,
          "references": null,
          "unique": false
        }
      ],
      "primaryKey": [
        "id"
      ],
      "indexes": [
        {
          "name": "task_status_history_task_idx",
          "columns": [
            "task_id",
            "changed_at"
          ],
          "unique": false,
          "where": null
        },
        {
          "name": "sqlite_autoindex_task_status_history_1",
          "columns": [
            "id"
          ],
          "unique": true,
          "where": null
        }
      ],
      "foreignKeys": [
        {
          "columns": [
            "to_status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "from_status_id"
          ],
          "referencedTable": "lookup_item",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "RESTRICT"
        },
        {
          "columns": [
            "task_id"
          ],
          "referencedTable": "task",
          "referencedColumns": [
            "id"
          ],
          "onDelete": "CASCADE"
        }
      ],
      "checks": [
        {
          "expression": "revision >= 1",
          "column": "revision"
        },
        {
          "expression": "sync_status IN ('local','pending','synced','conflict')",
          "column": "sync_status"
        }
      ],
      "syncable": true,
      "appendOnly": false
    }
  ]
};
