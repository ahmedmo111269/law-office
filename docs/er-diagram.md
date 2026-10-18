# ER diagram — core relationships (schema v1)

The diagram shows the load-bearing entities. Join tables without business attributes omit all columns. Every table also has the sync/audit header columns described in `docs/schema.md`.

```mermaid
erDiagram
  PARTY ||--o| PERSON : "is a natural person"
  PARTY ||--o| ORGANIZATION : "is a legal person"
  PARTY ||--o| CLIENT_PROFILE : "may be a client"
  PARTY ||--o{ PARTY_CONTACT : has
  PARTY ||--o{ PARTY_ADDRESS : has
  PARTY ||--o{ PARTY_ALIAS : has
  PARTY ||--o{ PARTY_RELATIONSHIP : from
  PARTY ||--o{ PARTY_RELATIONSHIP : to
  PARTY ||--o{ PARTY_INTERACTION : logs
  PARTY ||--o{ PARTY_SNAPSHOT : freezes

  COURT ||--o{ COURT_CIRCUIT : has
  COURT ||--o{ LEGAL_CASE : "files cases in"
  COURT ||--o{ HEARING : "sits at"
  COURT ||--o{ JUDGMENT : "issues"

  CASE_FILE ||--o{ CASE_FILE : "parent of sub-file"
  CASE_FILE ||--o{ CASE_FILE_PARTY : "parties in file"
  PARTY ||--o{ CASE_FILE_PARTY : participates
  LOOKUP_ITEM ||--o{ CASE_FILE_PARTY : "role / side"
  CASE_FILE ||--o{ CASE_FILE_CASE : links
  LEGAL_CASE ||--o{ CASE_FILE_CASE : links
  CASE_FILE ||--o{ CASE_FILE_LINK : relates
  CASE_FILE ||--o{ CASE_NOTE : has

  LEGAL_CASE ||--o{ HEARING : schedules
  HEARING ||--o| HEARING : "next_hearing_id"
  LEGAL_CASE ||--o{ JUDGMENT : produces
  HEARING ||--o{ JUDGMENT : "may produce"
  JUDGMENT ||--o{ JUDGMENT_APPEAL : "appealed by"
  JUDGMENT ||--o{ JUDGMENT_FILE_LINK : "filed under"
  CASE_FILE ||--o{ JUDGMENT_FILE_LINK : "contains"

  LEGAL_CASE ||--o{ TASK : "work on"
  CASE_FILE ||--o{ TASK : "work on"
  JUDGMENT ||--o{ TASK : "follow-up"
  TASK ||--o{ TASK_STATUS_HISTORY : "status log"
  TASK ||--o{ ANNOUNCEMENT : "service"
  PARTY ||--o{ APPOINTMENT : "meets"
  PARTY ||--o{ REMINDER : "reminded about"

  DOCUMENT ||--o{ DOCUMENT_VERSION : versions
  DOCUMENT ||--o{ DOCUMENT_LINK : links
  CASE_FILE ||--o{ DOCUMENT_LINK : "linked to"
  LEGAL_CASE ||--o{ DOCUMENT_LINK : "linked to"
  HEARING ||--o{ DOCUMENT_LINK : "linked to"
  JUDGMENT ||--o{ DOCUMENT_LINK : "linked to"
  CONTRACT ||--o{ DOCUMENT_LINK : "linked to"
  POWER_OF_ATTORNEY ||--o{ DOCUMENT_LINK : "linked to"
  PARTY ||--o{ DOCUMENT_LINK : "linked to"
  TASK ||--o{ DOCUMENT_LINK : "linked to"

  CONTRACT ||--o{ CONTRACT_PARTY : "signed by"
  PARTY ||--o{ CONTRACT_PARTY : signs
  PARTY ||--o{ POWER_OF_ATTORNEY : principal
  PARTY ||--o{ POWER_OF_ATTORNEY : agent

  PARTY ||--o{ FEE_AGREEMENT : "fee agreement"
  CASE_FILE ||--o{ FEE_AGREEMENT : "for file"
  PARTY ||--o{ FINANCIAL_CHARGE : owes
  CASE_FILE ||--o{ FINANCIAL_CHARGE : "for file"
  PARTY ||--o{ FINANCIAL_TRANSACTION : "pays/receives"
  FINANCIAL_ACCOUNT ||--o{ FINANCIAL_TRANSACTION : posts
  FINANCIAL_TRANSACTION ||--o{ PAYMENT_ALLOCATION : allocates
  FINANCIAL_CHARGE ||--o{ PAYMENT_ALLOCATION : "settled by"
  FINANCIAL_TRANSACTION ||--o| FINANCIAL_TRANSACTION : reverses

  LOCAL_DEVICE ||--o{ SYNC_OUTBOX : originates
  SYNC_ENTITY_TYPE ||--o{ SYNC_OUTBOX : "entity policy"
  SYNC_ENTITY_TYPE ||--o{ SYNC_CONFLICT : "entity policy"
  DELETION_BATCH ||--o{ DELETION_ENTRY : contains
```

## Relationship rules worth remembering

- **File ≠ case.** `case_file` is the office container; `legal_case` is the court case. `case_file_case` is many-to-many, so a case can serve several files and a file can carry several cases. Sub-files point at a parent and a root file; the root invariant is enforced by `CaseFileRepository`, not by a self-referential `CHECK` (SQLite cannot express “not my own ancestor”).
- **Party roles are per file and per case.** `case_file_party` stores role, side, ordinal, start/end dates. A person can be plaintiff in one file and witness in another; the same role in the same file is rejected, different roles are allowed.
- **Hearings are events, not appointments.** A held hearing is one row; the next session is a separate row linked by `next_hearing_id`, always later in time. Judgments are separate from procedural decisions; `judgment_type` is reference data. `judgment_appeal.user_deadline_on` is user-entered only.
- **Tasks carry their own transition log.** `task_status_history` records from/to status and notes. Work is not inferred from hearings.
- **Documents separate metadata from bytes.** `document` is metadata; `document_version` describes paper, external references, or local files, with checksum and storage state. `document_link` has an XOR check: exactly one target per link.
- **Finance is operational, not accounting.** A fee agreement is not a transaction; charges are amounts owed; transactions are money movements; allocations connect payments to charges. Posted rows are immutable; correction is a reversal.
- **Deletion is a graph operation.** `deletion_batch`/`deletion_entry` record every affected row so restore returns exactly the same set; blocked dependents abort before any write.

## Cardinality notes

| Relation | Cardinality |
| --- | --- |
| party → person / organization / client_profile | 0..1 each |
| case_file → parent_file | 0..1; parent_file → sub-files | 0..n |
| case_file ↔ legal_case | n..m through `case_file_case` |
| legal_case → hearings / judgments | 0..n |
| hearing → next hearing | 0..1 forward link |
| document ↔ target | n..1 through `document_link` (exactly one target) |
| financial_transaction → allocations | 0..n, sum ≤ payment and ≤ charge |
| financial_transaction → reversal | 0..1 (a posted reversal, never edits the original) |
