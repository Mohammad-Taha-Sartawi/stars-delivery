const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('ratings are unique per completed order and provider-scoped', () => {
  const model = source('src/models/Rating.js');

  assert.match(model, /orderId:[\s\S]*unique: true/);
  assert.match(model, /providerId/);
  assert.match(model, /min: 1/);
  assert.match(model, /max: 5/);
  assert.match(model, /providerId: 1, createdAt: -1/);
});

test('customers rate only their completed orders once', () => {
  const orders = source('src/routes/orders.js');

  assert.match(orders, /router\.post\('\/:id\/rating'/);
  assert.match(orders, /status: 'completed'/);
  assert.match(orders, /customerId: req\.userId/);
  assert.match(orders, /Rating\.create/);
  assert.match(orders, /RATING_EXISTS/);
  assert.match(orders, /myRating/);
});

test('provider stats expose the average rating and count', () => {
  const provider = source('src/routes/provider.js');

  assert.match(provider, /Rating\.aggregate/);
  assert.match(provider, /\$avg: '\$rating'/);
  assert.match(provider, /\$sum: '\$rating'/);
  assert.match(provider, /averageRating/);
  assert.match(provider, /ratingCount/);
  assert.match(provider, /ratingStars/);
});

test('rating notifications are persisted and indexed at startup', () => {
  const notification = source('src/models/Notification.js');
  const index = source('src/index.js');

  assert.match(notification, /'new_rating'/);
  assert.match(index, /Rating\.createIndexes\(\)/);
});
