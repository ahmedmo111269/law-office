import type { EngineRow } from '../../portable/store.ts';
import { ValidationError } from '../../errors.ts';
import type { ServiceDeps, TableRequest, TableResult } from './types.ts';
import { paginate } from './types.ts';

export interface AccountRow {
  account: EngineRow;
  kindName: string;
  balanceMinor: number;
}

export interface ChargeRow {
  charge: EngineRow;
  clientName: string;
  fileLabel: string | null;
  statusName: string;
  statusCode: string;
  amountMinor: number;
  paidMinor: number;
  outstandingMinor: number;
}

export interface TransactionRow {
  transaction: EngineRow;
  accountName: string;
  clientName: string | null;
  fileLabel: string | null;
  methodName: string;
  allocatedMinor: number;
  unallocatedMinor: number;
  reversed: boolean;
  reversalOf: string | null;
}

export interface FinanceOverview {
  accounts: AccountRow[];
  totalBalanceMinor: number;
  outstandingMinor: number;
  overdueMinor: number;
  receivedThisMonthMinor: number;
  expensesThisMonthMinor: number;
  unallocatedMinor: number;
  chargesCount: number;
  recipientsCount: number;
}

export interface AllocationInput {
  chargeId: string;
  amountMinor: number;
}

export class FinanceService {
  private readonly deps: ServiceDeps;

  constructor(deps: ServiceDeps) {
    this.deps = deps;
  }

  async accounts(): Promise<AccountRow[]> {
    const { db, lookups } = this.deps;
    const page = await db.query('financial_account', {
      orderBy: [{ column: 'name', direction: 'asc' }],
      limit: 100,
    });
    const rows: AccountRow[] = [];
    for (const account of page.rows) {
      rows.push({
        account,
        kindName: lookups.byId(String(account.account_kind_id ?? ''))?.nameAr ?? '—',
        balanceMinor: await db.accountBalance(String(account.id)),
      });
    }
    return rows;
  }

  async listCharges(request: TableRequest): Promise<TableResult<ChargeRow>> {
    const { db, lookups, cache } = this.deps;
    const statusId = request.filters.status ? lookups.id('charge_status', request.filters.status) : null;
    const page = await db.query('financial_charge', {
      filters: statusId ? [{ column: 'status_id', op: 'eq', value: statusId }] : [],
      orderBy: [{ column: 'issued_on', direction: request.sortDir ?? 'desc' }],
      ...paginate(request.page, request.pageSize),
    });
    const rows: ChargeRow[] = [];
    for (const charge of page.rows) {
      const client = await cache.get('party', String(charge.client_party_id));
      const file = await cache.get('case_file', charge.file_id ? String(charge.file_id) : null);
      const balance = await db.chargeBalance(String(charge.id));
      const status = lookups.byId(String(charge.status_id ?? ''));
      rows.push({
        charge,
        clientName: client ? String(client.display_name) : '—',
        fileLabel: file ? String(file.file_number) : null,
        statusName: status?.nameAr ?? '—',
        statusCode: status?.code ?? '',
        amountMinor: balance.amountMinor,
        paidMinor: balance.paidMinor,
        outstandingMinor: balance.outstandingMinor,
      });
    }
    return { rows, total: page.total };
  }

  async listTransactions(request: TableRequest): Promise<TableResult<TransactionRow>> {
    const { db, lookups, cache } = this.deps;
    const statusId = request.filters.status || 'posted';
    const page = await db.query('financial_transaction', {
      filters: [{ column: 'status', op: 'eq', value: statusId }],
      orderBy: [{ column: 'occurred_at', direction: request.sortDir ?? 'desc' }],
      ...paginate(request.page, request.pageSize),
    });
    const rows: TransactionRow[] = [];
    for (const transaction of page.rows) {
      const account = await cache.get('financial_account', String(transaction.account_id));
      const client = await cache.get('party', transaction.client_party_id ? String(transaction.client_party_id) : null);
      const file = await cache.get('case_file', transaction.file_id ? String(transaction.file_id) : null);
      const allocations = await db.query('payment_allocation', {
        filters: [{ column: 'transaction_id', op: 'eq', value: String(transaction.id) }],
        limit: 100,
      });
      const allocated = allocations.rows.reduce((sum, row) => sum + Number(row.amount_minor), 0);
      const reversals = await db.query('financial_transaction', {
        filters: [{ column: 'reverses_transaction_id', op: 'eq', value: String(transaction.id) }],
        limit: 5,
      });
      rows.push({
        transaction,
        accountName: account ? String(account.name) : '—',
        clientName: client ? String(client.display_name) : null,
        fileLabel: file ? String(file.file_number) : null,
        methodName: lookups.byId(String(transaction.method_id ?? ''))?.nameAr ?? '—',
        allocatedMinor: allocated,
        unallocatedMinor: Number(transaction.amount_minor) - allocated,
        reversed: reversals.rows.some((row) => row.status === 'posted' && row.deleted_at === null),
        reversalOf: transaction.reverses_transaction_id ? String(transaction.reverses_transaction_id) : null,
      });
    }
    return { rows, total: page.total };
  }

  async overview(): Promise<FinanceOverview> {
    const { db, lookups } = this.deps;
    const accounts = await this.accounts();
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const charges = await db.query('financial_charge', { limit: 500 });
    let outstandingMinor = 0;
    let overdueMinor = 0;
    let chargesCount = 0;
    const clients = new Set<string>();
    for (const charge of charges.rows) {
      if (charge.status_id === lookups.id('charge_status', 'cancelled')) continue;
      chargesCount += 1;
      clients.add(String(charge.client_party_id));
      const balance = await db.chargeBalance(String(charge.id));
      outstandingMinor += Math.max(0, balance.outstandingMinor);
      if (charge.due_on && String(charge.due_on) < new Date().toISOString().slice(0, 10) && balance.outstandingMinor > 0) {
        overdueMinor += balance.outstandingMinor;
      }
    }
    const received = await db.query('financial_transaction', {
      filters: [
        { column: 'status', op: 'eq', value: 'posted' },
        { column: 'direction', op: 'eq', value: 'in' },
        { column: 'occurred_at', op: 'gte', value: start },
      ],
      limit: 500,
    });
    const expenses = await db.query('financial_transaction', {
      filters: [
        { column: 'status', op: 'eq', value: 'posted' },
        { column: 'direction', op: 'eq', value: 'out' },
        { column: 'occurred_at', op: 'gte', value: start },
      ],
      limit: 500,
    });
    const unreceived = await db.query('financial_transaction', {
      filters: [{ column: 'status', op: 'eq', value: 'posted' }],
      limit: 500,
    });
    let unallocatedMinor = 0;
    for (const transaction of unreceived.rows) {
      const allocations = await db.query('payment_allocation', {
        filters: [{ column: 'transaction_id', op: 'eq', value: String(transaction.id) }],
        limit: 100,
      });
      unallocatedMinor += Number(transaction.amount_minor) - allocations.rows.reduce((sum, row) => sum + Number(row.amount_minor), 0);
    }
    return {
      accounts,
      totalBalanceMinor: accounts.reduce((sum, account) => sum + account.balanceMinor, 0),
      outstandingMinor,
      overdueMinor,
      receivedThisMonthMinor: received.rows.reduce((sum, row) => sum + Number(row.amount_minor), 0),
      expensesThisMonthMinor: expenses.rows.reduce((sum, row) => sum + Number(row.amount_minor), 0),
      unallocatedMinor,
      chargesCount,
      recipientsCount: clients.size,
    };
  }

  async outstandingCharges(clientId?: string, fileId?: string): Promise<ChargeRow[]> {
    const { db, lookups, cache } = this.deps;
    const filters = [
      ...(clientId ? [{ column: 'client_party_id', op: 'eq' as const, value: clientId }] : []),
      ...(fileId ? [{ column: 'file_id', op: 'eq' as const, value: fileId }] : []),
      { column: 'status_id', op: 'in' as const, value: [
        lookups.id('charge_status', 'outstanding'),
        lookups.id('charge_status', 'partially_paid'),
      ].filter((value): value is string => Boolean(value)) },
    ];
    const page = await db.query('financial_charge', {
      filters,
      orderBy: [{ column: 'issued_on', direction: 'asc' }],
      limit: 100,
    });
    const rows: ChargeRow[] = [];
    for (const charge of page.rows) {
      const balance = await db.chargeBalance(String(charge.id));
      if (balance.outstandingMinor <= 0) continue;
      const client = await cache.get('party', String(charge.client_party_id));
      const file = await cache.get('case_file', charge.file_id ? String(charge.file_id) : null);
      const status = lookups.byId(String(charge.status_id ?? ''));
      rows.push({
        charge,
        clientName: client ? String(client.display_name) : '—',
        fileLabel: file ? String(file.file_number) : null,
        statusName: status?.nameAr ?? '—',
        statusCode: status?.code ?? '',
        amountMinor: balance.amountMinor,
        paidMinor: balance.paidMinor,
        outstandingMinor: balance.outstandingMinor,
      });
    }
    return rows;
  }

  async createCharge(input: {
    clientPartyId: string;
    fileId?: string;
    description: string;
    amountMinor: number;
    dueOn?: string;
    chargeTypeCode?: string;
    notes?: string;
  }): Promise<EngineRow> {
    if (!input.description.trim()) throw new ValidationError('description is required');
    const charge = await this.deps.db.createCharge({
      clientPartyId: input.clientPartyId,
      description: input.description,
      amountMinor: input.amountMinor,
      ...(input.fileId ? { fileId: input.fileId } : {}),
      ...(input.dueOn ? { dueOn: input.dueOn } : {}),
    });
    const patch: Record<string, unknown> = {};
    if (input.chargeTypeCode) patch.charge_type_id = this.deps.lookups.id('charge_type', input.chargeTypeCode);
    if (input.notes) patch.notes = input.notes;
    if (Object.keys(patch).length > 0) await this.deps.db.update('financial_charge', String(charge.id), patch);
    return (await this.deps.db.get('financial_charge', String(charge.id))) ?? charge;
  }

  /**
   * Posts the payment and its allocations in one data-layer transaction. If any
   * allocation fails, the payment is rolled back too.
   */
  async recordPayment(input: {
    accountId: string;
    amountMinor: number;
    clientPartyId?: string;
    fileId?: string;
    methodCode?: string;
    occurredAt?: string;
    description?: string;
    allocations?: readonly AllocationInput[];
  }): Promise<{ transaction: EngineRow; allocations: EngineRow[] }> {
    return this.deps.db.transaction(async () => {
      const transaction = await this.deps.db.postTransaction({
        accountId: input.accountId,
        direction: 'in',
        amountMinor: input.amountMinor,
        ...(input.clientPartyId ? { clientPartyId: input.clientPartyId } : {}),
        ...(input.fileId ? { fileId: input.fileId } : {}),
        ...(input.methodCode ? { methodCode: input.methodCode } : {}),
        ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
        ...(input.description ? { description: input.description } : {}),
      });
      const allocations: EngineRow[] = [];
      for (const allocation of input.allocations ?? []) {
        if (allocation.amountMinor <= 0) continue;
        allocations.push(await this.deps.db.allocate(String(transaction.id), allocation.chargeId, allocation.amountMinor));
      }
      return { transaction, allocations };
    });
  }

  async postExpense(input: {
    accountId: string;
    amountMinor: number;
    description: string;
    categoryCode?: string;
    occurredAt?: string;
    fileId?: string;
  }): Promise<EngineRow> {
    if (!input.description.trim()) throw new ValidationError('description is required');
    const transaction = await this.deps.db.postTransaction({
      accountId: input.accountId,
      direction: 'out',
      amountMinor: input.amountMinor,
      description: input.description,
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
      ...(input.fileId ? { fileId: input.fileId } : {}),
    });
    if (input.categoryCode) {
      await this.deps.db.update('financial_transaction', String(transaction.id), {
        category_id: this.deps.lookups.id('transaction_category', input.categoryCode),
      });
    }
    return transaction;
  }

  async reverse(transactionId: string, reason: string): Promise<EngineRow> {
    if (!reason.trim()) throw new ValidationError('reason is required');
    return this.deps.db.reverseTransaction(transactionId, reason.trim());
  }

  async createAccount(input: { name: string; kindCode?: string; openingBalanceMinor?: number }): Promise<EngineRow> {
    if (!input.name.trim()) throw new ValidationError('account name is required');
    return this.deps.db.createAccount({
      name: input.name,
      ...(input.kindCode ? { kindCode: input.kindCode } : {}),
      ...(input.openingBalanceMinor !== undefined ? { openingBalanceMinor: input.openingBalanceMinor } : {}),
    });
  }

  async clientFinance(clientId: string): Promise<{ charges: ChargeRow[]; transactions: TransactionRow[]; outstandingMinor: number }> {
    const { db, lookups, cache } = this.deps;
    const chargeRows = (await db.query('financial_charge', {
      filters: [{ column: 'client_party_id', op: 'eq', value: clientId }],
      orderBy: [{ column: 'issued_on', direction: 'desc' }],
      limit: 100,
    })).rows;
    const charges: ChargeRow[] = [];
    let outstandingMinor = 0;
    for (const charge of chargeRows) {
      const balance = await db.chargeBalance(String(charge.id));
      const file = await cache.get('case_file', charge.file_id ? String(charge.file_id) : null);
      const status = lookups.byId(String(charge.status_id ?? ''));
      outstandingMinor += Math.max(0, balance.outstandingMinor);
      charges.push({
        charge,
        clientName: '',
        fileLabel: file ? String(file.file_number) : null,
        statusName: status?.nameAr ?? '—',
        statusCode: status?.code ?? '',
        amountMinor: balance.amountMinor,
        paidMinor: balance.paidMinor,
        outstandingMinor: balance.outstandingMinor,
      });
    }
    const transactionPage = await db.query('financial_transaction', {
      filters: [{ column: 'client_party_id', op: 'eq', value: clientId }],
      orderBy: [{ column: 'occurred_at', direction: 'desc' }],
      limit: 100,
    });
    const transactions: TransactionRow[] = [];
    for (const transaction of transactionPage.rows) {
      const account = await cache.get('financial_account', String(transaction.account_id));
      const allocations = await db.query('payment_allocation', {
        filters: [{ column: 'transaction_id', op: 'eq', value: String(transaction.id) }],
        limit: 100,
      });
      const allocated = allocations.rows.reduce((sum, row) => sum + Number(row.amount_minor), 0);
      transactions.push({
        transaction,
        accountName: account ? String(account.name) : '—',
        clientName: null,
        fileLabel: null,
        methodName: lookups.byId(String(transaction.method_id ?? ''))?.nameAr ?? '—',
        allocatedMinor: allocated,
        unallocatedMinor: Number(transaction.amount_minor) - allocated,
        reversed: false,
        reversalOf: transaction.reverses_transaction_id ? String(transaction.reverses_transaction_id) : null,
      });
    }
    return { charges, transactions, outstandingMinor };
  }
}
