// Platform commission for today and for the current month, and which drivers
// it came from (dashboard cards and their report).
//
// Commission is booked when the customer accepts the driver's offer (the
// order's acceptedAt; older orders without it fall back to createdAt).
// Commission an admin waived with "reset" is 0 on the order and so is not
// platform income; paid commission stays on the order and is counted.
//
// Days and months follow Palestine time (REPORT_TIME_ZONE, default
// Asia/Hebron), not the server clock, so "today" starts at local midnight.
const Order = require('../models/Order');
const User = require('../models/User');

const DEFAULT_TIME_ZONE = 'Asia/Hebron';
const BOOKED_STATUSES = ['accepted', 'fulfilling', 'completed'];

function reportTimeZone() {
  const configured = (process.env.REPORT_TIME_ZONE || '').trim();
  if (!configured) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: configured });
    return configured;
  } catch (_) {
    return DEFAULT_TIME_ZONE;
  }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** The instant of local midnight on year/month/day in [timeZone]. */
function zonedMidnight(year, month, day, timeZone) {
  const target = Date.UTC(year, month - 1, day);
  let instant = target;
  // Two passes settle the zone offset, including on daylight-saving days.
  for (let i = 0; i < 2; i += 1) {
    const p = zonedParts(new Date(instant), timeZone);
    const shownAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    instant += target - shownAsUtc;
  }
  return new Date(instant);
}

/**
 * Start (inclusive) and end (exclusive) of today or of this month, in the
 * report time zone, plus the local date for labels.
 */
function reportPeriod(period, now = new Date(), timeZone = reportTimeZone()) {
  const today = zonedParts(now, timeZone);
  if (period === 'month') {
    const nextMonth = today.month === 12
      ? { year: today.year + 1, month: 1 }
      : { year: today.year, month: today.month + 1 };
    return {
      period: 'month',
      timeZone,
      from: zonedMidnight(today.year, today.month, 1, timeZone),
      to: zonedMidnight(nextMonth.year, nextMonth.month, 1, timeZone),
      year: today.year,
      month: today.month,
      day: null,
    };
  }
  const tomorrow = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return {
    period: 'today',
    timeZone,
    from: zonedMidnight(today.year, today.month, today.day, timeZone),
    to: zonedMidnight(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      timeZone,
    ),
    year: today.year,
    month: today.month,
    day: today.day,
  };
}

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function bookedInPeriodPipeline({ from, to }) {
  return [
    {
      $match: {
        status: { $in: BOOKED_STATUSES },
        providerId: { $ne: null },
      },
    },
    { $addFields: { bookedAt: { $ifNull: ['$acceptedAt', '$createdAt'] } } },
    { $match: { bookedAt: { $gte: from, $lt: to } } },
  ];
}

/** Total platform commission booked in the period. */
async function commissionTotal(periodInfo) {
  const rows = await Order.aggregate([
    ...bookedInPeriodPipeline(periodInfo),
    { $group: { _id: null, total: { $sum: '$platformCommission' }, orders: { $sum: 1 } } },
  ]);
  return { total: roundMoney(rows[0]?.total), orders: rows[0]?.orders || 0 };
}

/**
 * The report behind a card: the platform commission in the period, broken
 * down by driver (highest first).
 */
async function commissionReport(period, now = new Date()) {
  const info = reportPeriod(period === 'month' ? 'month' : 'today', now);
  const rows = await Order.aggregate([
    ...bookedInPeriodPipeline(info),
    {
      $group: {
        _id: '$providerId',
        commission: { $sum: '$platformCommission' },
        orders: { $sum: 1 },
        revenue: { $sum: '$price' },
        driverEarnings: { $sum: '$providerEarning' },
      },
    },
    { $sort: { commission: -1, orders: -1, _id: 1 } },
  ]);

  const drivers = await User.find({ _id: { $in: rows.map((row) => row._id) } })
    .select('fullName publicId phoneNumbers')
    .lean();
  const byId = new Map(drivers.map((driver) => [driver._id.toString(), driver]));

  const lines = rows.map((row) => {
    const driver = byId.get(row._id.toString());
    const phones = driver?.phoneNumbers || [];
    return {
      driverId: row._id.toString(),
      name: driver ? driver.fullName : 'سائق محذوف',
      publicId: driver?.publicId || '',
      phone: (phones.find((phone) => phone.primary) || phones[0] || {}).number || '',
      deleted: !driver,
      orders: row.orders,
      commission: roundMoney(row.commission),
      revenue: roundMoney(row.revenue),
      driverEarnings: roundMoney(row.driverEarnings),
    };
  });

  return {
    period: info.period,
    timeZone: info.timeZone,
    from: info.from,
    to: info.to,
    year: info.year,
    month: info.month,
    day: info.day,
    total: roundMoney(lines.reduce((sum, line) => sum + line.commission, 0)),
    orders: lines.reduce((sum, line) => sum + line.orders, 0),
    drivers: lines,
  };
}

module.exports = {
  reportTimeZone,
  reportPeriod,
  zonedMidnight,
  commissionTotal,
  commissionReport,
};
