const ACCEPTABLE_OFFER_ORDER_STATES = Object.freeze(['pending', 'offered']);
const ORDER_TRANSITIONS = Object.freeze({
  accepted: 'fulfilling',
  fulfilling: 'completed',
});

function canAcceptOffer(status) {
  return ACCEPTABLE_OFFER_ORDER_STATES.includes(status);
}

function canCancelOrResend(status) {
  return canAcceptOffer(status);
}

function canAcceptOfferRecord(offerStatus, orderStatus) {
  return offerStatus === 'pending' && canAcceptOffer(orderStatus);
}

function nextProviderStatus(status) {
  return ORDER_TRANSITIONS[status] || null;
}

function isProviderAvailable(provider, now = new Date()) {
  return provider?.role === 'provider'
    && provider.status === 'active'
    && !provider.deleted
    && (!provider.blockedUntil || provider.blockedUntil <= now);
}

module.exports = {
  ACCEPTABLE_OFFER_ORDER_STATES,
  canAcceptOffer,
  canCancelOrResend,
  canAcceptOfferRecord,
  nextProviderStatus,
  isProviderAvailable,
};