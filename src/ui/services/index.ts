import { RecordCache } from './types.ts';
import type { ServiceDeps } from './types.ts';
import type { Workspace } from '../state/workspace.ts';
import { ClientService } from './clients.ts';
import { FileService } from './files.ts';
import { CaseService } from './cases.ts';
import { TaskService } from './tasks.ts';
import { AgendaService } from './agenda.ts';
import { DocumentService } from './documents.ts';
import { ContractService } from './contracts.ts';
import { FinanceService } from './finance.ts';
import { DashboardService } from './dashboard.ts';
import { PartyService } from './parties.ts';
import { JudgmentService } from './judgments.ts';
import { ExecutionService } from './execution.ts';
import { ReportService } from './reports.ts';

export interface Services {
  readonly deps: ServiceDeps;
  readonly clients: ClientService;
  readonly files: FileService;
  readonly cases: CaseService;
  readonly tasks: TaskService;
  readonly agenda: AgendaService;
  readonly documents: DocumentService;
  readonly contracts: ContractService;
  readonly finance: FinanceService;
  readonly dashboard: DashboardService;
  readonly parties: PartyService;
  readonly judgments: JudgmentService;
  readonly execution: ExecutionService;
  readonly reports: ReportService;
}

export function createServices(workspace: Workspace): Services {
  const cache = new RecordCache(workspace.db);
  const deps: ServiceDeps = {
    db: workspace.db,
    lookups: workspace.lookups,
    cache,
  };
  const agenda = new AgendaService(deps);
  const tasks = new TaskService(deps);
  const finance = new FinanceService(deps);
  return {
    deps,
    clients: new ClientService(deps),
    files: new FileService(deps),
    cases: new CaseService(deps),
    tasks,
    agenda,
    documents: new DocumentService(deps),
    contracts: new ContractService(deps),
    finance,
    dashboard: new DashboardService(deps, { agenda, tasks, finance }),
    parties: new PartyService(deps),
    judgments: new JudgmentService(deps),
    execution: new ExecutionService(deps),
    reports: new ReportService(deps),
  };
}

export * from './types.ts';
export type { ClientRow, ClientDetail, ClientInput } from './clients.ts';
export type { FileListRow, FileDetail } from './files.ts';
export type { CaseRow } from './cases.ts';
export type { TaskRow, TaskBuckets } from './tasks.ts';
export type { HearingRow, AppointmentRow, AnnouncementRow } from './agenda.ts';
export type { DocumentRow, DocumentDetail } from './documents.ts';
export type { ContractRow, PoaRow } from './contracts.ts';
export type { ChargeRow, TransactionRow, FinanceOverview, AccountRow } from './finance.ts';
export type { DashboardData, AttentionItem } from './dashboard.ts';
export type { PartyRow, PartyDetail } from './parties.ts';
export type { JudgmentRow, JudgmentDetail } from './judgments.ts';
export type { ExecutionRow, ExecutionDetail } from './execution.ts';
export type { ReportId, ReportResult, ReportRow } from './reports.ts';
