const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const lifecycle = require('../src/services/orderLifecycle');
const Offer = require('../src/models/Offer');
const Order = require('../src/models/Order');
const RejectedOrder = require('../src/models/RejectedOrder');

const backendRoot = path.resolve(__dirname, '..');

function source(file) {
  return fs.readFileSync(path.join(backendRoot, file), 'utf8');
}

test(
  'offers are valid for sixty seconds and lock the provider for the same window',
  () => {
    assert.equal(lifecycle.OFFER_VALIDITY_MS, 60 * 1000);
  },
);

test(
  'submitOffer stores expiry and provider cooldown',
  () => {
    const text = source('src/services/orderLifecycle.js');

    assert.match(
      text,
      /expiresAt: new Date\(now\.getTime\(\) \+ OFFER_VALIDITY_MS\)/,
    );

    assert.match(
      text,
      /offerCooldownUntil: cooldownUntil/,
    );

    assert.match(
      text,
      /'OFFER_COOLDOWN'/,
    );
  },
);

test(
  'expired offers are removed and rejected before acceptance',
  () => {
    const text = source('src/services/orderLifecycle.js');

    assert.match(
      text,
      /offer\.expiresAt && offer\.expiresAt <= new Date\(\)/,
    );

    const offersRoute = source('src/routes/offers.js');

    assert.match(
      offersRoute,
      /expireStaleOffers\(\{ orderId: order\._id \}\)/,
    );

    assert.match(
      source('src/index.js'),
      /expireStaleOffers\(\)/,
    );
  },
);

test(
  'expiring the last offer returns the order to pending',
  async () => {
    const original = {
      offerFind: Offer.find,
      offerDeleteMany: Offer.deleteMany,
      offerExists: Offer.exists,
      orderUpdateOne: Order.updateOne,
      rejectedUpdateOne: RejectedOrder.updateOne,
    };

    const updates = [];
    const reportRecords = [];

    try {
      Offer.find = () => ({
        select() { return this; },
        lean: async () => [{
          orderId: 'order-1',
          providerId: 'provider-1',
          expiresAt: new Date('2026-01-01T00:00:00Z'),
        }],
      });
      Offer.deleteMany = async () => ({ deletedCount: 1 });
      Offer.exists = async () => null;
      Order.updateOne = (filter, update) => {
        updates.push({ filter, update });
        return Promise.resolve({ matchedCount: 1 });
      };
      RejectedOrder.updateOne = (filter, update) => {
        reportRecords.push({ filter, update });
        return Promise.resolve({ upsertedCount: 1 });
      };

      const orderIds = await lifecycle.expireStaleOffers();

      assert.deepEqual(orderIds, ['order-1']);

      assert.deepEqual(updates, [{
        filter: { _id: 'order-1', status: 'offered' },
        update: { $set: { status: 'pending' } },
      }]);

      assert.equal(reportRecords.length, 1);
      assert.equal(
        reportRecords[0].update.$setOnInsert.reason,
        'offer_expired',
      );
    } finally {
      Offer.find = original.offerFind;
      Offer.deleteMany = original.offerDeleteMany;
      Offer.exists = original.offerExists;
      Order.updateOne = original.orderUpdateOne;
      RejectedOrder.updateOne = original.rejectedUpdateOne;
    }
  },
);

test(
  'a remaining active offer keeps the order offered',
  async () => {
    const original = {
      offerFind: Offer.find,
      offerDeleteMany: Offer.deleteMany,
      offerExists: Offer.exists,
      orderUpdateOne: Order.updateOne,
      rejectedUpdateOne: RejectedOrder.updateOne,
    };

    let orderUpdates = 0;

    try {
      Offer.find = () => ({
        select() { return this; },
        lean: async () => [{
          orderId: 'order-1',
          providerId: 'provider-1',
          expiresAt: new Date('2026-01-01T00:00:00Z'),
        }],
      });
      Offer.deleteMany = async () => ({ deletedCount: 1 });
      Offer.exists = async () => ({ _id: 'active-offer' });
      Order.updateOne = () => {
        orderUpdates += 1;
        return Promise.resolve({ matchedCount: 1 });
      };
      RejectedOrder.updateOne = async () => ({ upsertedCount: 1 });

      await lifecycle.expireStaleOffers();

      assert.equal(orderUpdates, 0);
    } finally {
      Offer.find = original.offerFind;
      Offer.deleteMany = original.offerDeleteMany;
      Offer.exists = original.offerExists;
      Order.updateOne = original.orderUpdateOne;
      RejectedOrder.updateOne = original.rejectedUpdateOne;
    }
  },
);

test(
  'provider availability queries ignore expired pending offers',
  () => {
    const text = source('src/routes/provider.js');

    assert.match(
      text,
      /\{ status: 'pending', expiresAt: \{ \$gt: now \} \}/,
    );

    assert.match(
      text,
      /status: 'pending',[\s\S]*?expiresAt: \{ \$gt: new Date\(\) \}/,
    );
  },
);

test(
  'cooldown state is exposed to the provider app',
  () => {
    assert.match(
      source('src/routes/provider.js'),
      /offerCooldownUntil,?\s*$/m,
    );

    assert.match(
      source('src/routes/orders.js'),
      /order\.offerCooldownUntil/,
    );

    assert.match(
      source('src/middleware/auth.js'),
      /offerCooldownUntil/,
    );
  },
);

test(
  'cooldown conflicts include the retry delay',
  () => {
    const conflict = new lifecycle.LifecycleConflict(
      'OFFER_COOLDOWN',
      'order-1',
      42,
    );

    assert.deepEqual(
      lifecycle.conflictResponse(conflict),
      {
        conflict: true,
        code: 'OFFER_COOLDOWN',
        message: 'You cannot submit another offer yet.',
        orderId: 'order-1',
        retryAfterSeconds: 42,
      },
    );
  },
);
