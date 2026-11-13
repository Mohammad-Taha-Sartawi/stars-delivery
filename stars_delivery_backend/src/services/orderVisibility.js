const {
  governorateKey,
  legacyAreasForGovernorate,
} = require('./registrationLocation');

function normalizeArea(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The order scope is the driver's choice alone. A provider can see:
 *  - orders from their own village/city, always;
 *  - orders from every other village/city in their governorate when the
 *    provider enabled governorate-level mode.
 * Customers only send orders; they have no scope setting.
 */
function providerVisibilityConditions(provider = {}) {
  const area = normalizeArea(provider.area);
  if (!area) {
    // Legacy accounts without a registered area keep the old unrestricted feed.
    return [];
  }

  const conditions = [{ area }];
  const governorate = governorateKey(provider);

  if (governorate && provider.governorateLevel === true) {
    conditions.push({ governorate });
    // Older orders may lack a stored governorate; match their village.
    conditions.push({ area: { $in: legacyAreasForGovernorate(governorate) } });
  }

  return conditions;
}

function providerVisibilityFilter(provider = {}) {
  const conditions = providerVisibilityConditions(provider);
  return conditions.length > 0 ? { $or: conditions } : null;
}

function canProviderSeeOrder(provider = {}, order = {}) {
  const providerArea = normalizeArea(provider.area);
  const orderArea = normalizeArea(order.area);

  if (!providerArea) return true;
  if (!orderArea || orderArea === providerArea) return true;

  if (provider.governorateLevel !== true) {
    return false;
  }

  const providerGovernorate = governorateKey(provider);
  const orderGovernorate = governorateKey(order);

  return Boolean(providerGovernorate)
    && providerGovernorate === orderGovernorate;
}

/**
 * Providers who should receive an order. Same-village providers always do;
 * providers elsewhere in the governorate do when they enabled governorate
 * mode.
 */
function orderResponderConditions(order = {}) {
  const area = normalizeArea(order.area);
  if (!area) return [];

  const conditions = [{ area }];
  const governorate = governorateKey(order);

  if (governorate) {
    conditions.push({
      governorateLevel: true,
      $or: [
        { governorate },
        { area: { $in: legacyAreasForGovernorate(governorate) } },
      ],
    });
  }

  return conditions;
}

function orderResponderFilter(order = {}) {
  const conditions = orderResponderConditions(order);
  return conditions.length > 0 ? { $or: conditions } : null;
}

/**
 * Drivers who would receive an order from this customer: drivers in the
 * customer's village, plus governorate-level drivers in the governorate.
 */
function customerProviderVisibilityFilter(customer = {}) {
  const area = normalizeArea(customer.area);
  if (!area) return null;

  const conditions = [{ area }];
  const governorate = governorateKey(customer);

  if (governorate) {
    conditions.push({
      governorateLevel: true,
      $or: [
        { governorate },
        { area: { $in: legacyAreasForGovernorate(governorate) } },
      ],
    });
  }

  return { $or: conditions };
}

module.exports = {
  providerVisibilityConditions,
  providerVisibilityFilter,
  canProviderSeeOrder,
  orderResponderConditions,
  orderResponderFilter,
  customerProviderVisibilityFilter,
};
