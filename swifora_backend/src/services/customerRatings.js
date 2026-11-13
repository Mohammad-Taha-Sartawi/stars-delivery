// Average rating drivers gave each customer, for drivers' order lists and
// the dashboard.
const mongoose = require('mongoose');
const CustomerRating = require('../models/CustomerRating');

/**
 * Returns Map<customerId string, { average, count }> for [customerIds].
 * Customers without ratings are absent from the map.
 */
async function customerRatingSummaries(customerIds) {
  const ids = [...new Set((customerIds || [])
    .filter(Boolean)
    .map((id) => id.toString())
    .filter((id) => mongoose.isValidObjectId(id)))]
    .map((id) => new mongoose.Types.ObjectId(id));
  if (ids.length === 0) return new Map();

  const rows = await CustomerRating.aggregate([
    { $match: { customerId: { $in: ids } } },
    { $group: { _id: '$customerId', count: { $sum: 1 }, stars: { $sum: '$rating' } } },
  ]);
  return new Map(rows.map((row) => [
    row._id.toString(),
    { average: Math.round((row.stars / row.count) * 10) / 10, count: row.count },
  ]));
}

/** The populated or raw customer id of an order document. */
function orderCustomerId(order) {
  const customer = order?.customerId;
  if (!customer) return null;
  return (customer._id || customer).toString();
}

/**
 * Adds `customerRating: { average, count }` (or null) to each order's
 * populated customer, in place. Returns the orders.
 */
async function attachCustomerRatings(orders) {
  const summaries = await customerRatingSummaries(orders.map(orderCustomerId));
  for (const order of orders) {
    const summary = summaries.get(orderCustomerId(order)) || null;
    if (order.customerId && typeof order.customerId === 'object' && order.customerId._id) {
      order.customerId.rating = summary;
    }
    order.customerRatingSummary = summary;
  }
  return orders;
}

module.exports = {
  customerRatingSummaries,
  attachCustomerRatings,
};
