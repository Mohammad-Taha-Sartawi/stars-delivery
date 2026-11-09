const test = require('node:test');
const assert = require('node:assert/strict');
const {
  commissionCutoff,
  splitCommission,
} = require('../src/services/commissionLedger');

const order = (platformCommission, acceptedAt, createdAt = '2026-11-01T10:00:00.000Z') => ({
  platformCommission,
  acceptedAt,
  createdAt,
});

test('commission is fully unpaid before any payment', () => {
  const driver = { commissionPaid: false, commissionPaidAt: null };
  const split = splitCommission(
    [order(1, '2026-11-09T10:00:00.000Z'), order(1, null)],
    driver,
  );

  assert.deepEqual(split, { unpaid: 2, paid: 0 });
  assert.equal(commissionCutoff(driver).getTime(), 0);
});

test('only commission accrued after the last payment is due again', () => {
  const driver = {
    commissionPaid: true,
    commissionPaidAt: new Date('2026-11-09T12:00:00.000Z'),
  };
  const split = splitCommission(
    [
      order(1, '2026-11-09T11:00:00.000Z'), // settled
      order(1, '2026-11-09T13:00:00.000Z'), // new due
      order(1, null, '2026-11-09T14:00:00.000Z'), // falls back to createdAt
    ],
    driver,
  );

  assert.deepEqual(split, { unpaid: 2, paid: 1 });
});

test('legacy paid accounts without a timestamp are considered settled', () => {
  const driver = { commissionPaid: true, commissionPaidAt: null };
  const split = splitCommission(
    [order(1, '2026-11-09T10:00:00.000Z')],
    driver,
  );

  assert.deepEqual(split, { unpaid: 0, paid: 1 });
  assert.ok(commissionCutoff(driver).getTime() > Date.now());
});
