const CommissionSetting = require('../models/CommissionSetting');

const DEFAULT_COMMISSION = Object.freeze({
  type: 'fixed',
  value: 1,
});

function normalizeCommissionConfig(raw = {}) {
  const type = raw.type === 'percent' ? 'percent' : 'fixed';
  const numeric = Number(raw.value);
  const value =
    Number.isFinite(numeric) && numeric >= 0
      ? numeric
      : DEFAULT_COMMISSION.value;

  return { type, value };
}

async function getCommissionConfig() {
  try {
    const setting = await CommissionSetting.findOne({ key: 'platform' }).lean();
    return normalizeCommissionConfig(setting || DEFAULT_COMMISSION);
  } catch (_) {
    return { ...DEFAULT_COMMISSION };
  }
}

function calculateCommission(price, config = DEFAULT_COMMISSION) {
  const normalized = normalizeCommissionConfig(config);
  const orderPrice = Number(price) || 0;
  const raw =
    normalized.type === 'percent'
      ? (orderPrice * normalized.value) / 100
      : normalized.value;
  const bounded = Math.min(Math.max(raw, 0), Math.max(orderPrice, 0));

  return Math.round(bounded * 100) / 100;
}

module.exports = {
  DEFAULT_COMMISSION,
  normalizeCommissionConfig,
  getCommissionConfig,
  calculateCommission,
};
