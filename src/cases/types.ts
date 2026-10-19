/** Versioned data-driven intake contracts. No legal entitlement/deadline rules. */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'date'
  | 'money'
  | 'select'
  | 'number';
export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
  when?: { field: string; equals: string };
  sensitive?: boolean;
}
export interface FieldGroup {
  key: string;
  label: string;
  help?: string;
  fields: readonly FieldDefinition[];
  classificationCodes?: readonly string[];
  when?: { field: string; equals: string };
  /** Controller remains visible even when the rest of the group is hidden. */
  controller?: string;
  sensitive?: boolean;
}
export interface CaseTemplate {
  version: number;
  typeCode: string;
  title: string;
  active: boolean;
  groups: readonly FieldGroup[];
  possibleStages: readonly string[];
  possibleRelations: readonly string[];
  suggestedAuthorities: readonly string[];
  completeness: { recommended: readonly string[] };
}
export type SpecializedValues = Record<string, Record<string, string>>;
export interface IntakeParty {
  linkId?: string;
  partyId: string;
  roleCode: string;
  sideCode?: string;
  isClient?: boolean;
}
export interface IntakeInput {
  fileId?: string;
  caseId?: string;
  title: string;
  caseTypeCode: string;
  subtypeId?: string | null;
  natureId?: string | null;
  subject?: string;
  facts?: string;
  requests?: string;
  officeCapacity?: string;
  responsiblePartyId?: string | null;
  receivedOn?: string;
  disputeStartedOn?: string | null;
  lastActionOn?: string | null;
  nextAction?: string;
  followUpOn?: string | null;
  priorityCode?: string;
  notes?: string;
  specialized?: SpecializedValues;
  termIds?: readonly string[];
  keywords?: readonly string[];
  parties?: readonly IntakeParty[];
  caseNumber?: string;
  caseYear?: number;
  courtId?: string;
  circuitId?: string;
  litigationDegreeCode?: string;
  statusCode?: string;
  registrationDate?: string;
  claimAmountMinor?: number;
  currencyCode?: string;
  sourceStageId?: string;
  initialStage?: StageInput;
  documentIds?: readonly string[];
  relatedCaseId?: string;
  relationCode?: string;
  confirmTypeChange?: boolean;
}
export interface StageInput {
  id?: string;
  fileId: string;
  caseId?: string | null;
  typeCode: string;
  customType?: string;
  authorityId?: string | null;
  referenceNumber?: string;
  referenceYear?: number | null;
  startedOn?: string | null;
  submittedOn?: string | null;
  notifiedOn?: string | null;
  attendedOn?: string | null;
  decisionOn?: string | null;
  completedOn?: string | null;
  followUpOn?: string | null;
  statusCode?: string;
  outcome?: string;
  decision?: string;
  closingReason?: string;
  previousStageId?: string | null;
  sourceDocumentId?: string | null;
  dataSource?: string;
  notes?: string;
}
export interface CompletionIssue {
  field: string;
  group: string;
  message: string;
  kind: 'basic' | 'procedural' | 'parties' | 'specialized' | 'indexing';
}
