const test = require('node:test');
const assert = require('node:assert/strict');
const requireRole = require('../src/middleware/requireRole');
const { isMobileRole } = require('../src/middleware/mobileRole');

const runMiddleware = (middleware, userRole) => {
  let nextCalled = false;
  let response;
  const req = { userRole };
  const res = {
    status(code) {
      response = { status: code };
      return this;
    },
    json(body) {
      response.body = body;
      return this;
    },
  };

  middleware(req, res, () => { nextCalled = true; });
  return { nextCalled, response };
};

test('customer is permitted on customer-only route', () => {
  assert.equal(runMiddleware(requireRole('customer'), 'customer').nextCalled, true);
});

test('provider is rejected on customer-only route', () => {
  assert.equal(runMiddleware(requireRole('customer'), 'provider').response.status, 403);
});

test('provider is permitted on provider-only route', () => {
  assert.equal(runMiddleware(requireRole('provider'), 'provider').nextCalled, true);
});

test('customer is rejected on provider-only route', () => {
  assert.equal(runMiddleware(requireRole('provider'), 'customer').response.status, 403);
});

test('customer and provider are permitted on shared route', () => {
  const middleware = requireRole('customer', 'provider');
  assert.equal(runMiddleware(middleware, 'customer').nextCalled, true);
  assert.equal(runMiddleware(middleware, 'provider').nextCalled, true);
});

test('admin and unknown roles are rejected from mobile roles', () => {
  assert.equal(isMobileRole('admin'), false);
  assert.equal(isMobileRole('unknown'), false);
  assert.equal(isMobileRole('customer'), true);
  assert.equal(isMobileRole('provider'), true);
});