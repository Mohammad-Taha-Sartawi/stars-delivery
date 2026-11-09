const {
  governorateKey,
  legacyAreasForGovernorate,
} = require('./registrationLocation');

function normalizeArea(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A provider can see:
 *  - orders from their own village/city, always;
 *  - orders from other villages/cities in their governorate only when both
 *    the provider and the customer enabled governorate-level mode.
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
    conditions.push({
      governorate,
      governorateLevel: true,
    });
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

  if (
    provider.governorateLevel !== true
    || order.governorateLevel !== true
  ) {
    return false;
  }

  const providerGovernorate = governorateKey(provider);
  const orderGovernorate = governorateKey(order);

  return Boolean(providerGovernorate)
    && providerGovernorate === orderGovernorate;
}

/**
 * Providers who should receive an order. Same-village providers always do;
 * cross-village providers only when both sides enabled governorate mode.
 */
function orderResponderConditions(order = {}) {
  const area = normalizeArea(order.area);
  if (!area) return [];

  const conditions = [{ area }];
  const governorate = governorateKey(order);

  if (order.governorateLevel === true && governorate) {
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
 * Drivers that can fulfil a customer order under the customer's current
 * governorate-level preference.
 */
function customerProviderVisibilityFilter(customer = {}) {
  const area = normalizeArea(customer.area);
  if (!area) return null;

  const conditions = [{ area }];
  const governorate = governorateKey(customer);

  if (customer.governorateLevel === true && governorate) {
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
