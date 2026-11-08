const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const lifecycle = require('../src/services/orderLifecycle');
const Offer = require('../src/models/Offer');
const Order = require('../src/models/Order');
const RejectedOrder = require('../src/models/RejectedOrder');
const User = require('../src/models/User');

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
  'expiring the last offer suspends the order only when no responders remain',
  async () => {
    const original = {
      offerFind: Offer.find,
      offerDeleteMany: Offer.deleteMany,
      offerExists: Offer.exists,
      orderFindById: Order.findById,
      orderUpdateOne: Order.updateOne,
      userCountDocuments: User.countDocuments,
      rejectedFind: RejectedOrder.find,
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
      Order.findById = () => ({
        select() { return this; },
        lean: async () => ({ _id: 'order-1', area: 'area-1' }),
      });
      Order.updateOne = (filter, update) => {
        updates.push({ filter, update });
        return Promise.resolve({ matchedCount: 1, modifiedCount: 1 });
      };
      User.countDocuments = async () => 0;
      RejectedOrder.find = () => ({
        distinct: async () => [],
      });
      RejectedOrder.updateOne = (filter, update) => {
        reportRecords.push({ filter, update });
        return Promise.resolve({ upsertedCount: 1 });
      };

      const orderIds = await lifecycle.expireStaleOffers();

      assert.deepEqual(orderIds, ['order-1']);

      assert.equal(updates.length, 1);

      assert.deepEqual(updates[0].filter, {
        _id: 'order-1',
        status: { $in: ['pending', 'offered'] },
        offerSuspendedUntil: null,
      });

      assert.equal(updates[0].update.$set.status, 'pending');

      assert.ok(
        updates[0].update.$set.offerWindowExpiredAt instanceof Date,
      );

      assert.ok(
        updates[0].update.$set.offerSuspendedUntil instanceof Date,
      );

      assert.ok(
        updates[0].update.$set.offerSuspendedUntil
        > updates[0].update.$set.offerWindowExpiredAt,
      );

      assert.equal(reportRecords.length, 1);
      assert.equal(
        reportRecords[0].update.$setOnInsert.reason,
        'offer_expired',
      );

      assert.equal(
        reportRecords[0].update.$setOnInsert.createdAt.getTime(),
        updates[0].update.$set.offerSuspendedUntil.getTime(),
      );
    } finally {
      Offer.find = original.offerFind;
      Offer.deleteMany = original.offerDeleteMany;
      Offer.exists = original.offerExists;
      Order.findById = original.orderFindById;
      Order.updateOne = original.orderUpdateOne;
      User.countDocuments = original.userCountDocuments;
      RejectedOrder.find = original.rejectedFind;
      RejectedOrder.updateOne = original.rejectedUpdateOne;
    }
  },
);

test(
  'expired offers keep waiting while available responders remain',
  async () => {
    const original = {
      offerFind: Offer.find,
      offerDeleteMany: Offer.deleteMany,
      offerExists: Offer.exists,
      orderFindById: Order.findById,
      orderUpdateOne: Order.updateOne,
      userCountDocuments: User.countDocuments,
      rejectedFind: RejectedOrder.find,
      rejectedUpdateOne: RejectedOrder.updateOne,
    };

    const updates = [];

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
      Order.findById = () => ({
        select() { return this; },
        lean: async () => ({ _id: 'order-1', area: 'area-1' }),
      });
      Order.updateOne = (filter, update) => {
        updates.push({ filter, update });
        return Promise.resolve({ matchedCount: 1, modifiedCount: 1 });
      };
      User.countDocuments = async () => 1;
      RejectedOrder.find = () => ({
        distinct: async () => [],
      });
      RejectedOrder.updateOne = async () => ({ upsertedCount: 1 });

      await lifecycle.expireStaleOffers();

      assert.equal(updates.length, 1);

      assert.deepEqual(updates[0].filter, {
        _id: 'order-1',
        status: 'offered',
      });

      assert.deepEqual(updates[0].update.$set, {
        status: 'pending',
        offerWindowExpiredAt: null,
        offerSuspendedUntil: null,
      });
    } finally {
      Offer.find = original.offerFind;
      Offer.deleteMany = original.offerDeleteMany;
      Offer.exists = original.offerExists;
      Order.findById = original.orderFindById;
      Order.updateOne = original.orderUpdateOne;
      User.countDocuments = original.userCountDocuments;
      RejectedOrder.find = original.rejectedFind;
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
  'expired offer windows are flagged and cleared by later lifecycle changes',
  () => {
    const lifecycleSource = source('src/services/orderLifecycle.js');

    assert.match(lifecycleSource, /offerWindowExpiredAt: now/);

    assert.match(lifecycleSource, /offerWindowExpiredAt: null/);

    assert.match(
      source('src/models/Order.js'),
      /offerWindowExpiredAt/,
    );
  },
);

test(
  'suspended orders are finalized into reports after five minutes',
  async () => {
    assert.equal(lifecycle.OFFER_SUSPENSION_MS, 300 * 1000);

    const original = Order.updateMany;
    let captured;

    try {
      Order.updateMany = (filter, update) => {
        captured = { filter, update };
        return Promise.resolve({ modifiedCount: 1 });
      };

      const modified = await lifecycle.finalizeExpiredOrders();

      assert.equal(modified, 1);
      assert.equal(captured.filter.status, 'pending');
      assert.ok(
        captured.filter.offerSuspendedUntil.$lte instanceof Date,
      );
      assert.deepEqual(captured.update, {
        $set: { status: 'expired' },
      });
    } finally {
      Order.updateMany = original;
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
