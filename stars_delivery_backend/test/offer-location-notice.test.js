const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('customer offer payload marks drivers from outside the order area', () => {
  const offers = source('src/routes/offers.js');

  assert.match(offers, /resolveRegistrationLocation/);
  assert.match(offers, /orderArea/);
  assert.match(offers, /outsideArea:\s*Boolean/);
  assert.match(offers, /providerArea/);
  assert.match(offers, /providerCity/);
  assert.match(offers, /providerGovernorate/);
});

test('customer offer UI shows a clear outside-area warning', () => {
  const screen = source('../lib/screens/order_offers_screen.dart');
  const model = source('../lib/models/offer_model.dart');

  assert.match(screen, /provider_outside_area_badge/);
  assert.match(screen, /provider_outside_area_card/);
  assert.match(screen, /_confirmAcceptOffer/);
  assert.match(screen, /provider_outside_area_title/);
  assert.match(model, /outsideArea/);
  assert.match(model, /providerGovernorate/);
  assert.match(model, /providerCity/);
});
