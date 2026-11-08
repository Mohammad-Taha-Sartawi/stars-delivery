const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test(
  'rejections are tracked per provider and order with a unique index',
  () => {
    const model = source('src/models/RejectedOrder.js');

    assert.match(
      model,
      /providerId:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId,\s*ref:\s*'User'/,
    );

    assert.match(
      model,
      /orderId:\s*\{\s*type:\s*mongoose\.Schema\.Types\.ObjectId,\s*ref:\s*'Order'/,
    );

    assert.match(
      model,
      /providerId:\s*1,\s*orderId:\s*1\s*\},\s*\{\s*unique:\s*true\s*\}/,
    );

    assert.match(model, /'driver_rejected'/);

    assert.match(model, /'offer_expired'/);
  },
);

test(
  'provider rejection hides the order only for the requesting provider',
  () => {
    const routes = source('src/routes/provider.js');

    assert.match(
      routes,
      /router\.post\(\s*'\/orders\/:orderId\/reject'/,
    );

    assert.match(routes, /RejectedOrder\.updateOne/);

    assert.match(routes, /\$setOnInsert/);

    assert.match(routes, /reason:\s*'driver_rejected'/);

    assert.match(
      routes,
      /reason:\s*r\.reason \|\| 'driver_rejected'/,
    );

    assert.doesNotMatch(
      routes,
      /Order\.(?:deleteOne|findOneAndDelete|findByIdAndDelete)/,
    );

    assert.match(
      routes,
      /router\.get\(\s*'\/rejected-orders'/,
    );

    assert.match(
      routes,
      /RejectedOrder\.find\(\s*\{\s*providerId:\s*req\.userId,\s*createdAt:/s,
    );

    assert.match(routes, /excludedOrderIds/);

    assert.match(
      routes,
      /RejectedOrder\.find\(\{\s*providerId\s*\}\)\.distinct\(\s*'orderId'\s*\)/,
    );

    assert.match(routes, /ordersReportCount/);

    assert.match(routes, /status:\s*'completed'/);

    assert.match(routes, /recordType:\s*'delivered'/);

    assert.match(routes, /recordType:\s*'rejected'/);
  },
);

test(
  'driver report exposes full customer contact only for delivered orders',
  () => {
    const routes = source('src/routes/provider.js');

    assert.match(
      routes,
      /const delivered = deliveredOrders\.map\(o => \(\{/,
    );

    assert.doesNotMatch(
      routes,
      /deliveredOrders\.map\(o => maskedOrder/,
    );

    assert.match(
      routes,
      /maskedOrder\(\{\s*\.\.\.order,\s*recordType: 'rejected'/s,
    );
  },
);

test(
  'server initializes the rejected-order indexes',
  () => {
    const index = source('src/index.js');

    assert.match(
      index,
      /RejectedOrder\.createIndexes\(\)/,
    );
  },
);
