const MOBILE_ROLES = Object.freeze(['customer', 'provider']);

const isMobileRole = (role) => MOBILE_ROLES.includes(role);

module.exports = { MOBILE_ROLES, isMobileRole };