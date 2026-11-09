const LEGACY_SETTLED_CUTOFF = new Date('9999-12-31T23:59:59.999Z');
const DAWN_OF_TIME = new Date(0);

/**
 * Returns the moment before which commission is considered settled.
 *
 * - `commissionPaidAt` is the authoritative last payment time.
 * - Legacy `commissionPaid: true` without a timestamp means all existing
 *   commissions were settled (kept for older accounts).
 * - Otherwise no commission has ever been paid.
 */
function commissionCutoff(user) {
  if (!user) {
    return DAWN_OF_TIME;
  }

  if (user.commissionPaidAt) {
    return new Date(user.commissionPaidAt);
  }

  return user.commissionPaid === true ? LEGACY_SETTLED_CUTOFF : DAWN_OF_TIME;
}

function commissionDueAt(order) {
  return order?.acceptedAt || order?.completedAt || order?.createdAt || null;
}

/**
 * Splits platform commission into unpaid (due now) and paid (settled by the
 * driver's last payment) amounts.
 */
function splitCommission(orders, user) {
  const cutoff = commissionCutoff(user);
  let unpaid = 0;
  let paid = 0;

  for (const order of orders || []) {
    const amount = Number(order.platformCommission) || 0;
    const dueAt = commissionDueAt(order);

    if (!dueAt || new Date(dueAt) > cutoff) {
      unpaid += amount;
    } else {
      paid += amount;
    }
  }

  return { unpaid, paid };
}

module.exports = {
  LEGACY_SETTLED_CUTOFF,
  commissionCutoff,
  commissionDueAt,
  splitCommission,
};
