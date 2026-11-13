// The lowest price a driver may offer, in shekels. Offers below it are
// rejected by the server; the app uses the same figure for its quick prices.
const MIN_OFFER_PRICE = 9;
const MAX_OFFER_PRICE = 100000;

module.exports = {
  MIN_OFFER_PRICE,
  MAX_OFFER_PRICE,
};
