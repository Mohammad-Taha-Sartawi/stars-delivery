const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test('delivery starts on fulfilling and customer confirmation is required', () => {
  const orders = source('src/models/Order.js');
  const lifecycle = source('src/services/orderLifecycle.js');
  const routes = source('src/routes/orders.js');

  assert.match(orders, /fulfillingAt/);
  assert.match(orders, /completionRequestedAt/);
  assert.match(orders, /deliveryConfirmedAt/);
  assert.match(orders, /deliveryRejectedAt/);
  assert.match(orders, /deliveryRejectionReason/);

  assert.match(lifecycle, /fulfillingAt: new Date\(\)/);
  assert.match(lifecycle, /requestDeliveryConfirmation/);
  assert.match(lifecycle, /confirmDelivery/);
  assert.match(lifecycle, /rejectDelivery/);
  assert.match(lifecycle, /deliveryConfirmedAt: now/);

  assert.match(routes, /\/:id\/confirm-delivery/);
  assert.match(routes, /\/:id\/reject-delivery/);
  assert.match(routes, /delivery_confirmation_requested/);
  assert.match(routes, /delivery_confirmation_result/);
});

test('mobile counters start from accomplishing delivery and expose confirmation actions', () => {
  const myOrders = source('../lib/screens/my_orders_screen.dart');
  const detail = source('../lib/screens/order_detail_screen.dart');
  const active = source('../lib/screens/provider_active_orders_screen.dart');
  const home = source('../lib/screens/home_screen.dart');

  assert.match(myOrders, /o\['fulfillingAt'\]/);
  assert.match(myOrders, /completionRequestedAt/);
  assert.match(myOrders, /approve_delivery/);
  assert.match(myOrders, /reject_delivery/);
  assert.match(myOrders, /delivery_not_started/);

  assert.match(detail, /awaiting_delivery_confirmation/);
  assert.match(active, /awaiting_delivery_confirmation/);
  assert.match(home, /onDeliveryConfirmationRequested/);
  assert.match(home, /_openDeliveryConfirmation/);
});
