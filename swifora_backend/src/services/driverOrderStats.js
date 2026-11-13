/**
 * Builds the distinct order ids that count as "not accepted" for a driver.
 *
 * Included:
 * - orders the driver explicitly rejected;
 * - offers the customer did not accept (status rejected);
 * - offers whose acceptance deadline has passed while still pending.
 *
 * Orders that were accepted by the customer and assigned to this driver are
 * excluded, and ids are de-duplicated across sources.
 */
function notAcceptedOrderIds({
  acceptedOrderIds = [],
  offers = [],
  rejectedOrderIds = [],
  now = new Date(),
} = {}) {
  const accepted = new Set(acceptedOrderIds.map((id) => String(id)));
  const ids = new Set();

  for (const orderId of rejectedOrderIds) {
    ids.add(String(orderId));
  }

  for (const offer of offers) {
    if (!offer?.orderId) {
      continue;
    }

    const orderId = String(offer.orderId);
    const expired =
      offer.expiresAt && new Date(offer.expiresAt) <= new Date(now);
    const notAccepted =
      offer.status === 'rejected' ||
      (offer.status === 'pending' && Boolean(expired));

    if (notAccepted) {
      ids.add(orderId);
    }
  }

  for (const orderId of accepted) {
    ids.delete(orderId);
  }

  return [...ids];
}

module.exports = { notAcceptedOrderIds };
