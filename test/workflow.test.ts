import assert from 'node:assert/strict';
import test from 'node:test';
import { makeCase, makeClient, makeCourt, makeFile, openHarness } from './helpers.ts';

test('7. hearing, judgment and resulting administrative task form a linked chain', () => {
  const h = openHarness('workflow');
  try {
    const client = makeClient(h.db);
    const courtId = makeCourt(h.db);
    const file = makeFile(h.db, [client.party.id]);
    const legalCase = makeCase(h.db, file.id, courtId, '789');
    const hearing = h.db.hearings.schedule({
      caseId: legalCase.id,
      scheduledAt: '2026-11-01T09:00:00.000Z',
      purpose: 'first_session',
    });
    const held = h.db.hearings.record(hearing.id, {
      statusCode: 'held',
      outcomeSummary: 'تم نظر الجلسة',
    });
    assert.equal(held.status_id !== hearing.status_id, true);
    assert.ok(held.held_at);

    const next = h.db.hearings.scheduleNext(hearing.id, {
      scheduledAt: '2026-12-06T09:00:00.000Z',
      purpose: 'next_session',
    });
    assert.equal(next.case_id, legalCase.id);
    assert.notEqual(next.id, hearing.id);
    assert.throws(
      () =>
        h.db.hearings.scheduleNext(hearing.id, {
          scheduledAt: '2026-10-01T09:00:00.000Z',
        }),
      /later|after|بعد/i,
    );

    const judgment = h.db.judgments.record({
      caseId: legalCase.id,
      hearingId: hearing.id,
      issuedOn: '2026-11-01',
      judgmentTypeCode: 'preliminary',
      operativePart: 'قبول الدعوى شكلاً',
      fileIds: [file.id],
    });
    assert.equal(h.db.judgments.getFull(judgment.id).files.length, 1);
    assert.equal(h.db.judgments.getFull(judgment.id).judgment.user_appeal_deadline, null);

    const task = h.db.tasks.create({
      title: 'إعلان الحكم',
      taskTypeCode: 'announcement',
      fileId: file.id,
      caseId: legalCase.id,
      hearingId: hearing.id,
      judgmentId: judgment.id,
      dueAt: '2026-11-05T09:00:00.000Z',
    });
    h.db.tasks.changeStatus(task.id, 'in_progress');
    const completed = h.db.tasks.complete(task.id, 'تم الإعلان');
    assert.ok(completed.completed_at);
    const full = h.db.tasks.getFull(task.id);
    assert.equal(full.statusHistory.length, 2);
    assert.equal(full.task.result_summary, 'تم الإعلان');
    assert.equal(h.db.hearings.listForCase(legalCase.id).length, 2);
  } finally {
    h.cleanup();
  }
});

test('8. a payment can be tied to both file and client and allocated to a charge', () => {
  const h = openHarness('finance');
  try {
    const client = makeClient(h.db);
    const file = makeFile(h.db, [client.party.id]);
    const account = h.db.finance.createAccount({ name: 'خزنة', kindCode: 'cash' });
    const agreement = h.db.finance.createFeeAgreement({
      clientPartyId: client.party.id,
      fileId: file.id,
      title: 'أتعاب الملف',
      totalAmountMinor: 500_000,
      currencyCode: 'EGP',
    });
    const charge = h.db.finance.createCharge({
      clientPartyId: client.party.id,
      fileId: file.id,
      feeAgreementId: agreement.id,
      description: 'الدفعة الأولى',
      amountMinor: 250_000,
      dueOn: '2026-11-10',
    });
    const payment = h.db.finance.postTransaction({
      accountId: account.id,
      direction: 'in',
      amountMinor: 250_000,
      clientPartyId: client.party.id,
      fileId: file.id,
      feeAgreementId: agreement.id,
      occurredAt: '2026-11-02T10:00:00.000Z',
      methodCode: 'cash',
      description: 'سداد',
    });
    assert.match(payment.receipt_no ?? '', /^RCPT-[A-Z0-9]+-2026-\d{5}$/);
    h.db.finance.allocate(payment.id, charge.id, 250_000);
    assert.equal(h.db.finance.accountBalance(account.id), 250_000);
    const chargeBalance = h.db.finance.chargeBalance(charge.id);
    assert.deepEqual(chargeBalance, {
      amountMinor: 250_000,
      paidMinor: 250_000,
      outstandingMinor: 0,
    });
    const summary = h.db.finance.clientSummary(client.party.id);
    assert.equal(summary.paidMinor, 250_000);
    assert.equal(summary.outstandingMinor, 0);
    assert.equal(summary.unallocatedMinor, 0);
    assert.throws(
      () => h.db.finance.voidTransaction(payment.id, 'خطأ'),
      (error: unknown) => (error as { code?: string }).code === 'INVALID_STATE',
    );
    const reversal = h.db.finance.reverseTransaction(payment.id, { reason: 'تصحيح' });
    assert.equal(reversal.direction, 'out');
    assert.equal(h.db.finance.accountBalance(account.id), 0);
    assert.equal(h.db.finance.chargeBalance(charge.id).paidMinor, 0);
  } finally {
    h.cleanup();
  }
});
