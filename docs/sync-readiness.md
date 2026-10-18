# Sync readiness (local half only)

**This phase implements no network transport.** There is no server, no account, no background sync, no automatic upload, and no “sync now” behaviour. What exists is the local change log and conflict metadata needed to build a reviewed sync protocol later.

## Change log

`sync_outbox` rows:

| Field | Meaning |
| --- | --- |
| `id` | Unique change id (UUID). The future transport sends this as the idempotency key. |
| `sequence` | Monotonic per database (`MAX+1`, `UNIQUE`). New-change detection and ordering, independent of wall-clock time. |
| `entity_type` | FK to `sync_entity_type` (43 policies). |
| `entity_id` | Record UUID (never a display number). |
| `operation` | `insert`, `update`, `delete`, `restore`. |
| `payload_json` | Canonical stable-stringified row at change time. |
| `changed_fields_json` | Sorted list for field-level merge decisions. |
| `origin_device_id` | Device that produced the change. |
| `created_at` | Local time of queueing. |
| `state` | `pending`, `sending`, `sent`, `failed`, `discarded`. |
| `attempt_count`, `last_attempt_at`, `last_error`, `sent_at` | Retry/observability. |

Lifecycle: `pending` → `markSending` → (`markSent` | `markFailed`). A failed change is retried by calling `markSending` again. `markSent` sets the entity’s `sync_status='synced'` only when no other pending/failed/sending row remains for that `(entity_type, entity_id)`; otherwise it stays `pending`.

**Dedupe:** the outbox `id` is stable and unique; a future receiver must treat repeated delivery of the same change id as the same operation. Sequence is per-device; global ordering requires the transport to carry device id + sequence.

**Deletions:** represented as `delete` outbox rows with the soft-deleted payload and `deleted_at`; restore produces a `restore` operation. No hard-delete tombstone stream exists yet.

**Dependent relations:** each change carries only its own row. Relation tables (`case_file_case`, `document_link`, `contract_party`, …) are their own entities and their own outbox rows, so a future engine must apply them in sequence or in a dependency-aware batch. No such applier is implemented.

## Conflict metadata

`sync_conflict` holds:

- entity type/id, base/local/remote revisions;
- local and remote device ids;
- full local and remote payloads (JSON);
- conflicting field names;
- status (`open`/`resolved`), resolution (`local`/`remote`/`merged`/`manual`), resolver device id and timestamps.

Unique on `(entity_type, entity_id, remote_revision, remote_device_id)` to prevent duplicate conflict rows for the same remote attempt. The local record is never overwritten by merely recording a conflict; a human resolution must choose/merge and then write through the normal repository path (which bumps revision and creates a new outbox entry).

## Declared policies by entity class

| Policy | Entities | Intended rule (not yet executed by a transport) |
| --- | --- | --- |
| `field_merge` | 31 entities incl. party, person, organization, client_profile, case_file, legal_case, hearing, judgment, task, document, contract, POA, fee_agreement | Merge non-overlapping changed fields; overlapping fields produce a conflict record. No blanket last-write-wins. |
| `relation_set` | 7 join tables (`party_relationship`, `case_file_link`, `case_file_case`, `legal_case_link`, `judgment_file_link`, `document_link`, `contract_party`) | Set semantics by `(entity id, relation columns)`; duplicate link creation rejected locally; remote merge must add/remove whole relations, not edit them field-wise. |
| `append_only` | `party_snapshot`, `task_status_history` | Never edited or deleted. Merge is union with duplicate detection; conflicts are reported rather than overwritten. |
| `ledger` | `financial_charge`, `financial_transaction` | Economic fields immutable after posting; corrections are new reversal rows. Never overwrite amounts, direction, account, receipt. Conflicts escalate to manual review. |
| `immutable` | `payment_allocation` | Rows are created, never edited or deleted. Allocation changes are compensating entries (future) or manual review. |

The registry also declares, per entity: mutable columns, sensitive columns (redacted in audit), soft-delete/archive behaviour, and dependent block/cascade rules. Those rules matter to a future applier: a remote delete cannot cascade locally in the same way as a user action without an explicit decision.

## What is deliberately missing

- HTTP/WebSocket/queue transport and authentication.
- Remote apply/merge implementation, including the `field_merge` algorithm.
- Per-field version vectors or hybrid clocks; revision + changed fields are the current basis.
- Conflict UI and resolution workflow.
- Server-side schema, retention, and access control.
- Attachment transfer.
- Ordering across devices; only per-device `sequence` exists.
- `sync_status` values on child rows are per-row; there is no “atomic remote transaction” concept.
- A `discarded` transition is defined in the schema but no code path uses it yet.

## Tests executed now

- conflict record contains both payloads and the disagreeing field list;
- resolving with `merged` clears the open conflict without deleting local data;
- outbox transitions pending → sending → failed → sending → sent;
- an entity becomes `synced` only after all its outbox rows are sent;
- every write produced exactly one outbox row per repository operation (insert/update).

Transport, remote apply, multi-device merge, and dedupe across the wire are **not tested because they do not exist**. They are listed in `docs/test-results.md` as deferred.

## Next step after approval

1. Define the transport contract and trust model (self-hosted LAN/office server vs. file-based manual transfer; no cloud requirement).
2. Implement a deterministic applier behind an interface, with the policy table above as executable rules.
3. Add a two-database integration harness (two files, simulated transport) before touching UI.
4. Only then add per-office identity/authorisation and attachment transfer.
