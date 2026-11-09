const ORDER_TYPES = ['product', 'people', 'goods'];

/**
 * Dashboard order counters use the server's local calendar day/month.
 */
function orderStatBoundaries(now = new Date()) {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  return { startOfToday, startOfMonth };
}

/**
 * Normalizes aggregation rows to a complete { today, month } map for every
 * order type, so the dashboard always receives all three counters.
 */
function normalizeOrderTypeCounts(rows = []) {
  const counts = {};
  for (const type of ORDER_TYPES) {
    counts[type] = { today: 0, month: 0 };
  }

  for (const row of rows) {
    if (!ORDER_TYPES.includes(row._id)) {
      continue;
    }

    counts[row._id] = {
      today: Number(row.today) || 0,
      month: Number(row.month) || 0,
    };
  }

  return counts;
}

module.exports = {
  ORDER_TYPES,
  orderStatBoundaries,
  normalizeOrderTypeCounts,
};
