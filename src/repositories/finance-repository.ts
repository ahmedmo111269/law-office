import type { SqlRow } from '../db/adapter.ts';
import { ConflictError, NotFoundError, ValidationError } from '../errors.ts';
import type { NumberSeriesService } from '../services/number-series.ts';
import { getSyncEntity } from '../sync/entity-registry.ts';
import { assertIsoDate, assertIsoTimestamp, todayInTimeZone, toCanonicalTimestamp } from '../util/dates.ts';
import { assertMinorAmount, assertPositiveMinorAmount } from '../util/money.ts';
import { BaseRepository, type EntityRecord, type RepositoryDependencies } from './base-repository.ts';
import type { LookupRepository } from './lookup-repository.ts';
import type { SettingsRepository } from './settings-repository.ts';

export interface FinancialAccountRecord extends EntityRecord {
  readonly name: string;
  readonly account_kind_id: string | null;
  readonly currency_code: string;
  readonly opening_balance_minor: number;
  readonly is_active: number;
}

export interface TransactionRecord extends EntityRecord {
  readonly account_id: string;
  readonly direction: 'in' | 'out';
  readonly transaction_type_id: string | null;
  readonly amount_minor: number;
  readonly currency_code: string;
  readonly occurred_at: string;
  readonly method_id: string | null;
  readonly receipt_no: string | null;
  readonly client_party_id: string | null;
  readonly file_id: string | null;
  readonly fee_agreement_id: string | null;
  readonly status: 'posted' | 'void';
  readonly void_reason: string | null;
  readonly voided_at: string | null;
  readonly reverses_transaction_id: string | null;
}

export interface ChargeRecord extends EntityRecord {
  readonly client_party_id: string;
  readonly file_id: string | null;
  readonly fee_agreement_id: string | null;
  readonly amount_minor: number;
  readonly currency_code: string;
  readonly status_id: string | null;
}

interface SqlResultRow extends SqlRow {
  readonly total: number;
}

/**
 * Operational finance, not a full accounting/tax system.
 *
 * Invariants:
 *  - money is integer piastres;
 *  - posted transactions and allocations can never be hard-deleted;
 *  - economic fields of a posted transaction never change (DB trigger);
 *  - correcting a posted transaction means voiding it (before allocation) or
 *    posting a reversing transaction and a new corrected one;
 *  - allocations may not exceed either the payment or the charge;
 *  - a charge amount cannot change after allocations exist.
 */
export class FinanceRepository {
  private readonly deps: RepositoryDependencies;
  private readonly lookups: LookupRepository;
  private readonly numbers: NumberSeriesService;
  private readonly settings: SettingsRepository;
  private readonly accounts: BaseRepository<FinancialAccountRecord>;
  private readonly agreements: BaseRepository<EntityRecord>;
  private readonly charges: BaseRepository<ChargeRecord>;
  private readonly transactions: BaseRepository<TransactionRecord>;
  private readonly allocations: BaseRepository<EntityRecord>;

  constructor(
    deps: RepositoryDependencies,
    lookups: LookupRepository,
    numbers: NumberSeriesService,
    settings: SettingsRepository,
  ) {
    this.deps = deps;
    this.lookups = lookups;
    this.numbers = numbers;
    this.settings = settings;
    this.accounts = new BaseRepository(deps, getSyncEntity('financial_account'));
    this.agreements = new BaseRepository(deps, getSyncEntity('fee_agreement'));
    this.charges = new BaseRepository<ChargeRecord>(deps, getSyncEntity('financial_charge'));
    this.transactions = new BaseRepository<TransactionRecord>(
      deps,
      getSyncEntity('financial_transaction'),
    );
    this.allocations = new BaseRepository(deps, getSyncEntity('payment_allocation'));
  }

  createAccount(input: {
    name: string;
    kindCode?: string;
    currencyCode?: string;
    openingBalanceMinor?: number;
    openedOn?: string;
    notes?: string;
  }): FinancialAccountRecord {
    if (!input.name?.trim()) throw new ValidationError('account name is required');
    const currency = input.currencyCode ?? 'EGP';
    this.requireCurrency(currency);
    if (input.openingBalanceMinor !== undefined) assertMinorAmount(input.openingBalanceMinor);
    if (input.openedOn) assertIsoDate(input.openedOn, 'openedOn');
    return this.accounts.insert({
      name: input.name.trim(),
      account_kind_id: this.lookups.resolveOptional('account_kind', input.kindCode ?? 'cash'),
      currency_code: currency,
      opening_balance_minor: input.openingBalanceMinor ?? 0,
      opened_on: input.openedOn ?? null,
      is_active: 1,
      notes: input.notes ?? null,
    });
  }

  createFeeAgreement(input: {
    clientPartyId: string;
    fileId?: string;
    contractId?: string;
    agreementTypeCode?: string;
    statusCode?: string;
    title: string;
    totalAmountMinor: number;
    currencyCode?: string;
    startOn?: string;
    dueOn?: string;
    terms?: string;
    notes?: string;
  }): EntityRecord {
    this.requireParty(input.clientPartyId);
    if (input.fileId) this.requireFile(input.fileId);
    if (input.contractId) this.requireExisting('contract', input.contractId);
    if (!input.title?.trim()) throw new ValidationError('agreement title is required');
    assertMinorAmount(input.totalAmountMinor, 'totalAmountMinor');
    if (input.totalAmountMinor < 0) throw new ValidationError('total amount cannot be negative');
    const currency = input.currencyCode ?? this.defaultCurrency();
    this.requireCurrency(currency);
    if (input.startOn) assertIsoDate(input.startOn, 'startOn');
    if (input.dueOn) assertIsoDate(input.dueOn, 'dueOn');
    return this.agreements.insert({
      client_party_id: input.clientPartyId,
      file_id: input.fileId ?? null,
      contract_id: input.contractId ?? null,
      agreement_type_id: this.lookups.resolveOptional('fee_agreement_type', input.agreementTypeCode),
      status_id: this.lookups.requireItemByCode(
        'fee_agreement_status',
        input.statusCode ?? 'active',
        'fee agreement status',
      ).id,
      title: input.title.trim(),
      total_amount_minor: input.totalAmountMinor,
      currency_code: currency,
      start_on: input.startOn ?? null,
      due_on: input.dueOn ?? null,
      terms: input.terms ?? null,
      notes: input.notes ?? null,
      archived_at: null,
    });
  }

  createCharge(input: {
    clientPartyId: string;
    fileId?: string;
    feeAgreementId?: string;
    chargeTypeCode?: string;
    description: string;
    amountMinor: number;
    currencyCode?: string;
    issuedOn?: string;
    dueOn?: string;
    notes?: string;
  }): ChargeRecord {
    this.requireParty(input.clientPartyId);
    if (input.fileId) this.requireFile(input.fileId);
    if (input.feeAgreementId) this.requireExisting('fee_agreement', input.feeAgreementId);
    if (!input.description?.trim()) throw new ValidationError('charge description is required');
    assertPositiveMinorAmount(input.amountMinor);
    const currency = input.currencyCode ?? this.defaultCurrency();
    this.requireCurrency(currency);
    if (input.issuedOn) assertIsoDate(input.issuedOn, 'issuedOn');
    if (input.dueOn) assertIsoDate(input.dueOn, 'dueOn');
    return this.charges.insert({
      client_party_id: input.clientPartyId,
      file_id: input.fileId ?? null,
      fee_agreement_id: input.feeAgreementId ?? null,
      charge_type_id: this.lookups.resolveOptional('charge_type', input.chargeTypeCode),
      description: input.description.trim(),
      amount_minor: input.amountMinor,
      currency_code: currency,
      issued_on: input.issuedOn ?? todayInTimeZone(this.defaultTimezone(), this.deps.clock),
      due_on: input.dueOn ?? null,
      status_id: this.lookups.requireItemByCode('charge_status', 'outstanding', 'charge status').id,
      notes: input.notes ?? null,
    });
  }

  postTransaction(input: {
    accountId: string;
    direction: 'in' | 'out';
    amountMinor: number;
    currencyCode?: string;
    transactionTypeCode?: string;
    occurredAt?: string;
    methodCode?: string;
    referenceNo?: string;
    receiptNo?: string;
    clientPartyId?: string;
    fileId?: string;
    feeAgreementId?: string;
    categoryCode?: string;
    description?: string;
    reversesTransactionId?: string;
  }): TransactionRecord {
    const account = this.accounts.requireById(input.accountId);
    if (account.is_active !== 1) throw new ValidationError('account is inactive');
    assertPositiveMinorAmount(input.amountMinor);
    const currency = input.currencyCode ?? account.currency_code;
    if (currency !== account.currency_code) {
      throw new ValidationError('transaction currency must match the account currency');
    }
    this.requireCurrency(currency);
    if (input.clientPartyId) this.requireParty(input.clientPartyId);
    if (input.fileId) this.requireFile(input.fileId);
    if (input.feeAgreementId) {
      const agreement = this.requireExisting('fee_agreement', input.feeAgreementId);
      if (agreement.currency_code !== currency) {
        throw new ValidationError('agreement currency must match the transaction currency');
      }
    }
    if (input.reversesTransactionId) {
      this.requireExisting('financial_transaction', input.reversesTransactionId);
    }
    const occurredAt = toCanonicalTimestamp(
      assertIsoTimestamp(input.occurredAt ?? toCanonicalTimestamp(this.deps.clock.now()), 'occurredAt'),
    );

    let receiptNo = input.receiptNo?.trim() || null;
    if (
      input.direction === 'in' &&
      !receiptNo &&
      !input.reversesTransactionId &&
      this.settings.getBoolean('finance.receipt_on_payment', true)
    ) {
      receiptNo = this.numbers.next('receipt.number').formatted;
    }

    return this.transactions.insert({
      account_id: input.accountId,
      direction: input.direction,
      transaction_type_id: this.lookups.resolveOptional(
        'transaction_type',
        input.transactionTypeCode,
      ),
      amount_minor: input.amountMinor,
      currency_code: currency,
      occurred_at: occurredAt,
      method_id: this.lookups.resolveOptional('payment_method', input.methodCode),
      reference_no: input.referenceNo ?? null,
      receipt_no: receiptNo,
      client_party_id: input.clientPartyId ?? null,
      file_id: input.fileId ?? null,
      fee_agreement_id: input.feeAgreementId ?? null,
      category_id: this.lookups.resolveOptional('transaction_category', input.categoryCode),
      description: input.description ?? null,
      status: 'posted',
      void_reason: null,
      voided_at: null,
      reverses_transaction_id: input.reversesTransactionId ?? null,
    });
  }

  allocate(
    transactionId: string,
    chargeId: string,
    amountMinor: number,
    notes?: string,
  ): EntityRecord {
    assertPositiveMinorAmount(amountMinor);
    return this.deps.db.transaction(() => {
      const transaction = this.transactions.requireById(transactionId);
      const charge = this.charges.requireById(chargeId);
      if (transaction.status !== 'posted') {
        throw new ValidationError('cannot allocate a voided transaction');
      }
      if (transaction.direction !== 'in') {
        throw new ValidationError('only incoming payments can be allocated');
      }
      if (transaction.currency_code !== charge.currency_code) {
        throw new ValidationError('currency mismatch between payment and charge');
      }
      const transactionAllocated = this.sumAllocations('transaction_id', transactionId);
      if (transactionAllocated + amountMinor > transaction.amount_minor) {
        throw new ValidationError('amount exceeds the unallocated payment balance', {
          unallocated: transaction.amount_minor - transactionAllocated,
        });
      }
      const chargeAllocated = this.sumAllocations('charge_id', chargeId);
      if (chargeAllocated + amountMinor > charge.amount_minor) {
        throw new ValidationError('amount exceeds the outstanding charge balance', {
          outstanding: charge.amount_minor - chargeAllocated,
        });
      }

      const allocation = this.allocations.insert({
        transaction_id: transactionId,
        charge_id: chargeId,
        amount_minor: amountMinor,
        notes: notes ?? null,
      });

      const paid = chargeAllocated + amountMinor;
      const statusCode = paid >= charge.amount_minor ? 'paid' : 'partially_paid';
      const statusId = this.lookups.requireItemByCode('charge_status', statusCode).id;
      if (charge.status_id !== statusId) {
        this.charges.update(chargeId, { status_id: statusId });
      }
      return allocation;
    });
  }

  /** Voids an unallocated posted transaction. Allocated ones must be reversed. */
  voidTransaction(transactionId: string, reason: string): TransactionRecord {
    if (!reason?.trim()) throw new ValidationError('void reason is required');
    const transaction = this.transactions.requireById(transactionId);
    if (transaction.status === 'void') throw new ValidationError('transaction is already void');
    if (this.sumAllocations('transaction_id', transactionId) > 0) {
      throw new ConflictError(
        'allocated transactions must be corrected by posting a reversing transaction',
        'INVALID_STATE',
        { transactionId },
      );
    }
    return this.transactions.update(
      transactionId,
      {
        status: 'void',
        void_reason: reason.trim(),
        voided_at: toCanonicalTimestamp(this.deps.clock.now()),
      },
      { auditAction: 'transaction_void', summary: 'voided financial transaction' },
    );
  }

  /** Posts the opposite movement, preserving the original record. */
  reverseTransaction(
    transactionId: string,
    input: { reason: string; occurredAt?: string; transactionTypeCode?: string },
  ): TransactionRecord {
    if (!input.reason?.trim()) throw new ValidationError('reversal reason is required');
    const original = this.transactions.requireById(transactionId);
    if (original.status !== 'posted') throw new ValidationError('only posted transactions can be reversed');
    return this.deps.db.transaction(() => {
      const reversal = this.postTransaction({
        accountId: original.account_id,
        direction: original.direction === 'in' ? 'out' : 'in',
        amountMinor: original.amount_minor,
        currencyCode: original.currency_code,
        ...(input.transactionTypeCode === undefined
        ? {}
        : { transactionTypeCode: input.transactionTypeCode }),
        ...(input.occurredAt === undefined ? {} : { occurredAt: input.occurredAt }),
        ...(original.client_party_id === null ? {} : { clientPartyId: original.client_party_id }),
        ...(original.file_id === null ? {} : { fileId: original.file_id }),
        ...(original.fee_agreement_id === null ? {} : { feeAgreementId: original.fee_agreement_id }),
        reversesTransactionId: transactionId,
        description: `قيد عكسي: ${input.reason.trim()}`,
      });
      const charges = this.deps.db.query<{ charge_id: string }>(
        'SELECT DISTINCT charge_id FROM payment_allocation WHERE transaction_id = ? AND deleted_at IS NULL',
        [transactionId],
      );
      for (const charge of charges) this.refreshChargeStatus(charge.charge_id);
      return reversal;
    });
  }

  accountBalance(accountId: string): number {
    const account = this.accounts.requireById(accountId);
    const row = this.deps.db.get<SqlResultRow>(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount_minor ELSE -amount_minor END), 0) AS total
       FROM financial_transaction
       WHERE account_id = ? AND status = 'posted' AND deleted_at IS NULL`,
      [accountId],
    );
    assertMinorAmount(row?.total ?? 0, 'balance');
    return account.opening_balance_minor + (row?.total ?? 0);
  }

  chargeBalance(chargeId: string): { amountMinor: number; paidMinor: number; outstandingMinor: number } {
    const charge = this.charges.requireById(chargeId);
    const paid = this.sumAllocations('charge_id', chargeId, true);
    return {
      amountMinor: charge.amount_minor,
      paidMinor: paid,
      outstandingMinor: charge.amount_minor - paid,
    };
  }

  clientSummary(clientPartyId: string): {
    chargedMinor: number;
    paidMinor: number;
    outstandingMinor: number;
    receivedMinor: number;
    unallocatedMinor: number;
  } {
    this.requireParty(clientPartyId);
    const charged =
      this.deps.db.get<SqlResultRow>(
        `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM financial_charge
         WHERE client_party_id = ? AND deleted_at IS NULL`,
        [clientPartyId],
      )?.total ?? 0;
    const paid =
      this.deps.db.get<SqlResultRow>(
        `SELECT COALESCE(SUM(a.amount_minor), 0) AS total
         FROM payment_allocation a
         JOIN financial_transaction t ON t.id = a.transaction_id
         JOIN financial_charge c ON c.id = a.charge_id
         WHERE c.client_party_id = ? AND t.status = 'posted'
           AND NOT EXISTS (
             SELECT 1 FROM financial_transaction r
             WHERE r.reverses_transaction_id = t.id AND r.status = 'posted' AND r.deleted_at IS NULL
           )
           AND a.deleted_at IS NULL AND t.deleted_at IS NULL AND c.deleted_at IS NULL`,
        [clientPartyId],
      )?.total ?? 0;
    const received =
      this.deps.db.get<SqlResultRow>(
        `SELECT COALESCE(SUM(amount_minor), 0) AS total FROM financial_transaction
         WHERE client_party_id = ? AND direction = 'in' AND status = 'posted' AND deleted_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM financial_transaction r
             WHERE r.reverses_transaction_id = financial_transaction.id
               AND r.status = 'posted' AND r.deleted_at IS NULL
           )`,
        [clientPartyId],
      )?.total ?? 0;
    const allocatedToCharges =
      this.deps.db.get<SqlResultRow>(
        `SELECT COALESCE(SUM(a.amount_minor), 0) AS total FROM financial_transaction t
         JOIN payment_allocation a ON a.transaction_id = t.id
         WHERE t.client_party_id = ? AND t.direction = 'in' AND t.status = 'posted'
           AND NOT EXISTS (
             SELECT 1 FROM financial_transaction r
             WHERE r.reverses_transaction_id = t.id AND r.status = 'posted' AND r.deleted_at IS NULL
           )
           AND a.deleted_at IS NULL AND t.deleted_at IS NULL`,
        [clientPartyId],
      )?.total ?? 0;
    return {
      chargedMinor: charged,
      paidMinor: paid,
      outstandingMinor: charged - paid,
      receivedMinor: received,
      unallocatedMinor: received - allocatedToCharges,
    };
  }

  getTransaction(id: string): TransactionRecord {
    return this.transactions.requireById(id);
  }

  getAccount(id: string): FinancialAccountRecord {
    return this.accounts.requireById(id);
  }

  getCharge(id: string): ChargeRecord {
    return this.charges.requireById(id);
  }

  listTransactions(options: { limit?: number; offset?: number } = {}): TransactionRecord[] {
    return this.transactions.list({
      limit: options.limit ?? 50,
      offset: options.offset ?? 0,
      orderBy: { column: 'occurred_at', direction: 'desc' },
    });
  }

  listCharges(options: { clientPartyId?: string; limit?: number } = {}): ChargeRecord[] {
    return this.charges.list({
      filters: options.clientPartyId
        ? [{ column: 'client_party_id', value: options.clientPartyId }]
        : [],
      limit: options.limit ?? 100,
      orderBy: { column: 'issued_on', direction: 'desc' },
    });
  }

  /** Recomputes a charge status from its currently effective allocations. */
  private refreshChargeStatus(chargeId: string): void {
    const charge = this.charges.requireById(chargeId);
    const paid = this.sumAllocations('charge_id', chargeId, true);
    const code = paid <= 0 ? 'outstanding' : paid >= charge.amount_minor ? 'paid' : 'partially_paid';
    const statusId = this.lookups.requireItemByCode('charge_status', code).id;
    if (charge.status_id !== statusId) this.charges.update(chargeId, { status_id: statusId });
  }

  private sumAllocations(
    column: 'transaction_id' | 'charge_id',
    id: string,
    postedOnly = false,
  ): number {
    const join = postedOnly
      ? `JOIN financial_transaction t ON t.id = a.transaction_id AND t.status = 'posted'
         AND NOT EXISTS (
           SELECT 1 FROM financial_transaction r
           WHERE r.reverses_transaction_id = t.id AND r.status = 'posted' AND r.deleted_at IS NULL
         )`
      : '';
    const row = this.deps.db.get<SqlResultRow>(
      `SELECT COALESCE(SUM(a.amount_minor), 0) AS total
       FROM payment_allocation a ${join}
       WHERE a.${column} = ? AND a.deleted_at IS NULL`,
      [id],
    );
    return row?.total ?? 0;
  }

  private requireCurrency(code: string): void {
    if (!this.deps.db.get('SELECT code FROM currency WHERE code = ? AND is_active = 1', [code])) {
      throw new ValidationError(`unknown or inactive currency ${code}`);
    }
  }

  private requireParty(id: string): void {
    if (!this.deps.db.get('SELECT id FROM party WHERE id = ? AND deleted_at IS NULL', [id])) {
      throw new NotFoundError('party', id);
    }
  }

  private requireFile(id: string): void {
    if (!this.deps.db.get('SELECT id FROM case_file WHERE id = ? AND deleted_at IS NULL', [id])) {
      throw new NotFoundError('case_file', id);
    }
  }

  private requireExisting(table: string, id: string): SqlRow {
    const row = this.deps.db.get<SqlRow>(
      `SELECT * FROM "${table}" WHERE id = ? AND deleted_at IS NULL`,
      [id],
    );
    if (!row) throw new NotFoundError(table, id);
    return row;
  }

  private defaultCurrency(): string {
    return this.settings.getString('finance.default_currency', 'EGP');
  }

  private defaultTimezone(): string {
    return this.settings.getString('locale.timezone', 'Africa/Cairo');
  }
}
