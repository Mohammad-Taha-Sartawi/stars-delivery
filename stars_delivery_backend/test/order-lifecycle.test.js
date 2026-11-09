const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Offer = require('../src/models/Offer');
const Order = require('../src/models/Order');
const RejectedOrder = require('../src/models/RejectedOrder');
const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const lifecycle = require('../src/services/orderLifecycle');
const { executeTransaction } = require('../src/services/transaction');
const {
  canAcceptOffer,
  canCancelOrResend,
  canAcceptOfferRecord,
  nextProviderStatus,
  isProviderAvailable,
} = require('../src/services/orderState');

test('accepted orders may transition only to fulfilling', () => {
  assert.equal(nextProviderStatus('accepted'), 'fulfilling');
  assert.equal(nextProviderStatus('accepted') === 'fulfilling', true);
});

test('pending orders cannot transition directly to fulfilling', () => {
  assert.equal(nextProviderStatus('pending'), null);
});

test('fulfilling orders may transition only to completed', () => {
  assert.equal(nextProviderStatus('fulfilling'), 'completed');
});

test('accepted orders cannot transition directly to completed', () => {
  assert.notEqual(nextProviderStatus('accepted'), 'completed');
});

test('completed orders have no provider transition and cannot move backward', () => {
  assert.equal(nextProviderStatus('completed'), null);
  assert.equal(nextProviderStatus('completed') === 'fulfilling', false);
});

test('only pending or offered orders accept offers, cancel, or resend', () => {
  for (const status of ['pending', 'offered']) {
    assert.equal(canAcceptOffer(status), true);
    assert.equal(canCancelOrResend(status), true);
  }
  for (const status of ['accepted', 'fulfilling', 'completed', 'cancelled']) {
    assert.equal(canAcceptOffer(status), false);
    assert.equal(canCancelOrResend(status), false);
  }
});

test('provider availability rejects inactive, deleted, and blocked providers', () => {
  assert.equal(isProviderAvailable({ role: 'provider', status: 'active', deleted: false, blockedUntil: null }), true);
  assert.equal(isProviderAvailable({ role: 'provider', status: 'inactive', deleted: false, blockedUntil: null }), false);
  assert.equal(isProviderAvailable({ role: 'provider', status: 'active', deleted: true, blockedUntil: null }), false);
  assert.equal(isProviderAvailable({ role: 'provider', status: 'active', deleted: false, blockedUntil: new Date(Date.now() + 60_000) }), false);
  assert.equal(isProviderAvailable({ role: 'provider', status: 'active', deleted: false, blockedUntil: new Date(Date.now() - 60_000) }), true);
});

test('provider/order index remains non-unique until an explicit data migration is approved', () => {
  const index = Offer.schema.indexes().find(([fields]) => fields.providerId === 1 && fields.orderId === 1);
  assert.ok(index);
  assert.notEqual(index[1]?.unique, true);
});


test('submitOffer serializes on the provider and rejects an existing provider/order offer before order mutation', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  const sequence = [];
  let orderWrites = 0;
  let offerCreates = 0;
  let notificationCreates = 0;

  const original = {
    startSession: mongoose.startSession,
    userFindOneAndUpdate: User.findOneAndUpdate,
    rejectedFindOne: RejectedOrder.findOne,
    offerFindOne: Offer.findOne,
    orderUpdateOne: Order.updateOne,
    offerCreate: Offer.create,
    notificationCreate: Notification.create,
  };

  try {
    mongoose.startSession = async () => session;

    User.findOneAndUpdate = (filter, update, options) => {
      assert.equal(options.session, session);
      assert.equal(update.$inc.offerSequence, 1);

      sequence.push('provider-lock');

      return {
        lean: async () => ({
          _id: 'provider-1',
          fullName: 'Provider',
        }),
      };
    };

    RejectedOrder.findOne = (filter) => {
      assert.deepEqual(filter, {
        orderId: 'order-1',
        providerId: 'provider-1',
      });

      sequence.push('rejected-check');

      return {
        select() {
          return this;
        },
        session(activeSession) {
          assert.equal(activeSession, session);
          return this;
        },
        lean: async () => null,
      };
    };

    Offer.findOne = (filter) => {
      assert.deepEqual(filter, {
        orderId: 'order-1',
        providerId: 'provider-1',
      });

      sequence.push('duplicate-check');

      return {
        select() {
          return this;
        },
        session(activeSession) {
          assert.equal(activeSession, session);
          return this;
        },
        lean: async () => ({ _id: 'existing-offer' }),
      };
    };

    Order.updateOne = () => {
      orderWrites += 1;
      return Promise.resolve({ matchedCount: 1 });
    };

    Offer.create = () => {
      offerCreates += 1;
      return Promise.resolve([]);
    };

    Notification.create = () => {
      notificationCreates += 1;
      return Promise.resolve([]);
    };

    await assert.rejects(
      () => lifecycle.submitOffer({
        orderId: 'order-1',
        providerId: 'provider-1',
        price: 20,
        estimatedTime: 15,
      }),
      (error) =>
        error instanceof lifecycle.LifecycleConflict
        && error.code === 'OFFER_NOT_AVAILABLE'
    );

    assert.deepEqual(sequence, [
      'provider-lock',
      'rejected-check',
      'duplicate-check',
    ]);

    assert.equal(orderWrites, 0);
    assert.equal(offerCreates, 0);
    assert.equal(notificationCreates, 0);
  } finally {
    mongoose.startSession = original.startSession;
    User.findOneAndUpdate = original.userFindOneAndUpdate;
    RejectedOrder.findOne = original.rejectedFindOne;
    Offer.findOne = original.offerFindOne;
    Order.updateOne = original.orderUpdateOne;
    Offer.create = original.offerCreate;
    Notification.create = original.notificationCreate;
  }
});

test('submitOffer blocks a provider who already rejected the order', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  const original = {
    startSession: mongoose.startSession,
    userFindOneAndUpdate: User.findOneAndUpdate,
    rejectedFindOne: RejectedOrder.findOne,
    offerFindOne: Offer.findOne,
    orderUpdateOne: Order.updateOne,
  };

  let duplicateChecks = 0;
  let orderWrites = 0;

  try {
    mongoose.startSession = async () => session;

    User.findOneAndUpdate = () => ({
      lean: async () => ({
        _id: 'provider-1',
        fullName: 'Provider',
      }),
    });

    RejectedOrder.findOne = (filter) => {
      assert.deepEqual(filter, {
        orderId: 'order-1',
        providerId: 'provider-1',
      });

      return {
        select() {
          return this;
        },
        session(activeSession) {
          assert.equal(activeSession, session);
          return this;
        },
        lean: async () => ({ _id: 'rejection-1' }),
      };
    };

    Offer.findOne = () => {
      duplicateChecks += 1;
      throw new Error('duplicate lookup must not run');
    };

    Order.updateOne = () => {
      orderWrites += 1;
      throw new Error('order mutation must not run');
    };

    await assert.rejects(
      () => lifecycle.submitOffer({
        orderId: 'order-1',
        providerId: 'provider-1',
        price: 20,
        estimatedTime: 10,
      }),
      (error) =>
        error instanceof lifecycle.LifecycleConflict
        && error.code === 'OFFER_NOT_AVAILABLE'
    );

    assert.equal(duplicateChecks, 0);
    assert.equal(orderWrites, 0);
  } finally {
    mongoose.startSession = original.startSession;
    User.findOneAndUpdate = original.userFindOneAndUpdate;
    RejectedOrder.findOne = original.rejectedFindOne;
    Offer.findOne = original.offerFindOne;
    Order.updateOne = original.orderUpdateOne;
  }
});

test('transaction passes one session to all work and commits before post-work', async () => {
  const session = { withTransaction: async (work) => work(session), endSession: async () => {} };
  const seen = [];
  const result = await executeTransaction({
    startSession: async () => session,
    work: async (activeSession) => {
      seen.push(activeSession);
      seen.push(activeSession);
      return 'committed';
    },
    onCommitted: async (value) => seen.push(value),
  });
  assert.equal(result, 'committed');
  assert.deepEqual(seen, [session, session, 'committed']);
});

test('failed transaction produces no post-commit side effect', async () => {
  const session = { withTransaction: async (work) => work(session), endSession: async () => {} };
  let socketEvents = 0;
  await assert.rejects(() => executeTransaction({
    startSession: async () => session,
    work: async () => { throw new Error('simulated transaction failure'); },
    onCommitted: async () => { socketEvents += 1; },
  }));
  assert.equal(socketEvents, 0);
});

test('acceptance passes the transaction session to every database mutation', async () => {
  const session = { withTransaction: async (work) => work(session), endSession: async () => {} };
  const writes = [];
  const query = (value) => ({
    populate() { return this; },
    session(activeSession) { writes.push(activeSession); return this; },
    select() { return this; },
    lean: async () => value,
  });
  const original = {
    startSession: mongoose.startSession,
    offerFindOne: Offer.findOne,
    offerUpdate: Offer.updateOne,
    offerUpdateMany: Offer.updateMany,
    orderUpdate: Order.updateOne,
    userFindOneAndUpdate: User.findOneAndUpdate,
    userFindById: User.findById,
    notificationCreate: Notification.create,
  };

  try {
    mongoose.startSession = async () => session;
    Offer.findOne = () => query({
      _id: 'offer-1',
      status: 'pending',
      providerId: 'provider-1',
      price: 10,
      estimatedTime: 10,
      orderId: { _id: 'order-1', customerId: 'customer-1', status: 'offered' },
    });
    User.findOneAndUpdate = (filter, update, options) => {
      writes.push(options.session);
      return query({ _id: 'provider-1' });
    };
    Order.updateOne = (filter, update, options) => {
      writes.push(options.session);
      assert.equal(update.$set.estimatedTime, 10);
      assert.ok(update.$set.acceptedAt instanceof Date);
      return Promise.resolve({ modifiedCount: 1 });
    };
    Offer.updateOne = (filter, update, options) => {
      writes.push(options.session);
      return Promise.resolve({ modifiedCount: 1 });
    };
    Offer.updateMany = (filter, update, options) => {
      writes.push(options.session);
      return Promise.resolve({});
    };
    User.findById = () => query({ fullName: 'Customer' });
    Notification.create = (documents, options) => {
      writes.push(options.session);
      return Promise.resolve(documents);
    };

    await lifecycle.acceptOffer({ offerId: 'offer-1', customerId: 'customer-1' });
    assert.equal(writes.length, 6);
    assert.ok(writes.every((activeSession) => activeSession === session));
  } finally {
    mongoose.startSession = original.startSession;
    Offer.findOne = original.offerFindOne;
    Offer.updateOne = original.offerUpdate;
    Offer.updateMany = original.offerUpdateMany;
    Order.updateOne = original.orderUpdate;
    User.findOneAndUpdate = original.userFindOneAndUpdate;
    User.findById = original.userFindById;
    Notification.create = original.notificationCreate;
  }
});

test('only a pending offer on a pending or offered order may be accepted', () => {
  assert.equal(canAcceptOfferRecord('pending', 'pending'), true);
  assert.equal(canAcceptOfferRecord('pending', 'offered'), true);
  assert.equal(canAcceptOfferRecord('accepted', 'offered'), false);
  assert.equal(canAcceptOfferRecord('pending', 'accepted'), false);
});

test('acceptOffer rejects a customer ownership mismatch before provider reservation', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  let providerWrites = 0;

  const original = {
    startSession: mongoose.startSession,
    offerFindOne: Offer.findOne,
    userFindOneAndUpdate: User.findOneAndUpdate,
  };

  const query = (value) => ({
    populate() {
      return this;
    },
    session(activeSession) {
      assert.equal(activeSession, session);
      return this;
    },
    lean: async () => value,
  });

  try {
    mongoose.startSession = async () => session;

    Offer.findOne = () => query({
      _id: 'offer-ownership',
      status: 'pending',
      providerId: 'provider-1',
      price: 20,
      orderId: {
        _id: 'order-ownership',
        customerId: 'different-customer',
        status: 'offered',
      },
    });

    User.findOneAndUpdate = () => {
      providerWrites += 1;
      throw new Error('provider reservation must not occur');
    };

    await assert.rejects(
      () => lifecycle.acceptOffer({
        offerId: 'offer-ownership',
        customerId: 'customer-1',
      }),
      (error) =>
        error instanceof lifecycle.LifecycleConflict
        && error.code === 'ORDER_NOT_AVAILABLE'
    );

    assert.equal(providerWrites, 0);
  } finally {
    mongoose.startSession = original.startSession;
    Offer.findOne = original.offerFindOne;
    User.findOneAndUpdate = original.userFindOneAndUpdate;
  }
});

test('acceptOffer rejects a busy provider before changing the order', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  let orderWrites = 0;

  const original = {
    startSession: mongoose.startSession,
    offerFindOne: Offer.findOne,
    userFindOneAndUpdate: User.findOneAndUpdate,
    orderUpdateOne: Order.updateOne,
  };

  const offerQuery = {
    populate() {
      return this;
    },
    session(activeSession) {
      assert.equal(activeSession, session);
      return this;
    },
    lean: async () => ({
      _id: 'offer-busy',
      status: 'pending',
      providerId: 'provider-busy',
      price: 25,
      orderId: {
        _id: 'order-busy',
        customerId: 'customer-1',
        status: 'offered',
      },
    }),
  };

  try {
    mongoose.startSession = async () => session;
    Offer.findOne = () => offerQuery;

    User.findOneAndUpdate = (filter, update, options) => {
      assert.equal(options.session, session);
      assert.equal(filter.role, 'provider');
      assert.equal(filter.status, 'active');
      assert.deepEqual(filter.deleted, { $ne: true });
      assert.ok(Array.isArray(filter.$or));

      return {
        lean: async () => null,
      };
    };

    Order.updateOne = () => {
      orderWrites += 1;
      return Promise.resolve({ modifiedCount: 1 });
    };

    await assert.rejects(
      () => lifecycle.acceptOffer({
        offerId: 'offer-busy',
        customerId: 'customer-1',
      }),
      (error) =>
        error instanceof lifecycle.LifecycleConflict
        && error.code === 'PROVIDER_BUSY'
    );

    assert.equal(orderWrites, 0);
  } finally {
    mongoose.startSession = original.startSession;
    Offer.findOne = original.offerFindOne;
    User.findOneAndUpdate = original.userFindOneAndUpdate;
    Order.updateOne = original.orderUpdateOne;
  }
});

test('submitOffer rejects an unavailable provider before duplicate or order mutation', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  let duplicateChecks = 0;
  let orderWrites = 0;

  const original = {
    startSession: mongoose.startSession,
    userFindOneAndUpdate: User.findOneAndUpdate,
    userFindById: User.findById,
    offerFindOne: Offer.findOne,
    orderUpdateOne: Order.updateOne,
  };

  try {
    mongoose.startSession = async () => session;

    User.findOneAndUpdate = (filter, update, options) => {
      assert.equal(options.session, session);
      assert.equal(filter.role, 'provider');
      assert.equal(filter.status, 'active');
      assert.deepEqual(filter.deleted, { $ne: true });
      assert.ok(Array.isArray(filter.$or));
      assert.equal(update.$inc.offerSequence, 1);

      return {
        lean: async () => null,
      };
    };

    User.findById = (id) => {
      assert.equal(id, 'provider-busy');

      return {
        select() { return this; },
        session(activeSession) {
          assert.equal(activeSession, session);
          return this;
        },
        lean: async () => ({
          offerCooldownUntil: null,
          blockedUntil: null,
        }),
      };
    };

    Offer.findOne = () => {
      duplicateChecks += 1;
      throw new Error('duplicate lookup must not run');
    };

    Order.updateOne = () => {
      orderWrites += 1;
      throw new Error('order mutation must not run');
    };

    await assert.rejects(
      () => lifecycle.submitOffer({
        orderId: 'order-submit-busy',
        providerId: 'provider-busy',
        price: 30,
        estimatedTime: 10,
      }),
      (error) =>
        error instanceof lifecycle.LifecycleConflict
        && error.code === 'PROVIDER_BUSY'
    );

    assert.equal(duplicateChecks, 0);
    assert.equal(orderWrites, 0);
  } finally {
    mongoose.startSession = original.startSession;
    User.findOneAndUpdate = original.userFindOneAndUpdate;
    User.findById = original.userFindById;
    Offer.findOne = original.offerFindOne;
    Order.updateOne = original.orderUpdateOne;
  }
});

test('submitOffer rejects a provider who paused order reception', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  let duplicateChecks = 0;
  let orderWrites = 0;

  const original = {
    startSession: mongoose.startSession,
    userFindOneAndUpdate: User.findOneAndUpdate,
    userFindById: User.findById,
    offerFindOne: Offer.findOne,
    orderUpdateOne: Order.updateOne,
  };

  try {
    mongoose.startSession = async () => session;

    User.findOneAndUpdate = (filter) => {
      assert.deepEqual(filter.isAvailable, { $ne: false });
      return { lean: async () => null };
    };

    User.findById = () => ({
      select() { return this; },
      session() { return this; },
      lean: async () => ({
        offerCooldownUntil: null,
        blockedUntil: null,
        isAvailable: false,
      }),
    });

    Offer.findOne = () => {
      duplicateChecks += 1;
      throw new Error('duplicate lookup must not run');
    };

    Order.updateOne = () => {
      orderWrites += 1;
      throw new Error('order mutation must not run');
    };

    await assert.rejects(
      () => lifecycle.submitOffer({
        orderId: 'order-submit-paused',
        providerId: 'provider-paused',
        price: 30,
        estimatedTime: 10,
      }),
      (error) =>
        error instanceof lifecycle.LifecycleConflict
        && error.code === 'PROVIDER_UNAVAILABLE'
    );

    assert.equal(duplicateChecks, 0);
    assert.equal(orderWrites, 0);
  } finally {
    mongoose.startSession = original.startSession;
    User.findOneAndUpdate = original.userFindOneAndUpdate;
    User.findById = original.userFindById;
    Offer.findOne = original.offerFindOne;
    Order.updateOne = original.orderUpdateOne;
  }
});

test('resetOrder enforces customer ownership and pre-acceptance states in one transaction', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  const original = {
    startSession: mongoose.startSession,
    orderFindOneAndUpdate: Order.findOneAndUpdate,
    offerUpdateMany: Offer.updateMany,
  };

  let offerUpdateSession;

  try {
    mongoose.startSession = async () => session;

    Order.findOneAndUpdate = (filter, update, options) => {
      assert.equal(filter._id, 'order-reset');
      assert.equal(filter.customerId, 'customer-1');
      assert.deepEqual(
        filter.status,
        { $in: lifecycle.ACCEPTABLE_ORDER_STATUSES }
      );

      assert.equal(update.$set.status, 'pending');
      assert.equal(update.$set.providerId, null);
      assert.equal(options.session, session);
      assert.equal(options.new, true);

      return {
        lean: async () => ({
          _id: 'order-reset',
          customerId: 'customer-1',
          status: 'pending',
        }),
      };
    };

    Offer.updateMany = (filter, update, options) => {
      assert.equal(filter.orderId, 'order-reset');
      assert.equal(update.$set.status, 'rejected');
      offerUpdateSession = options.session;
      return Promise.resolve({});
    };

    const result = await lifecycle.resetOrder({
      orderId: 'order-reset',
      customerId: 'customer-1',
    });

    assert.equal(result.status, 'pending');
    assert.equal(offerUpdateSession, session);
  } finally {
    mongoose.startSession = original.startSession;
    Order.findOneAndUpdate = original.orderFindOneAndUpdate;
    Offer.updateMany = original.offerUpdateMany;
  }
});

test('cancelOrder enforces customer ownership and pre-acceptance states in one transaction', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  const original = {
    startSession: mongoose.startSession,
    orderFindOneAndUpdate: Order.findOneAndUpdate,
    offerUpdateMany: Offer.updateMany,
  };

  let offerUpdateSession;

  try {
    mongoose.startSession = async () => session;

    Order.findOneAndUpdate = (filter, update, options) => {
      assert.equal(filter._id, 'order-cancel');
      assert.equal(filter.customerId, 'customer-1');
      assert.deepEqual(
        filter.status,
        { $in: lifecycle.ACCEPTABLE_ORDER_STATUSES }
      );

      assert.equal(update.$set.status, 'cancelled');
      assert.equal(options.session, session);

      return {
        lean: async () => ({
          _id: 'order-cancel',
          customerId: 'customer-1',
          status: 'cancelled',
        }),
      };
    };

    Offer.updateMany = (filter, update, options) => {
      assert.deepEqual(filter, {
        orderId: 'order-cancel',
        status: 'pending',
      });

      assert.equal(update.$set.status, 'rejected');
      offerUpdateSession = options.session;

      return Promise.resolve({});
    };

    const result = await lifecycle.cancelOrder({
      orderId: 'order-cancel',
      customerId: 'customer-1',
    });

    assert.equal(result.status, 'cancelled');
    assert.equal(offerUpdateSession, session);
  } finally {
    mongoose.startSession = original.startSession;
    Order.findOneAndUpdate = original.orderFindOneAndUpdate;
    Offer.updateMany = original.offerUpdateMany;
  }
});

test('transitionOrder requires provider ownership and exact source state', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  const original = {
    startSession: mongoose.startSession,
    orderFindOneAndUpdate: Order.findOneAndUpdate,
    notificationCreate: Notification.create,
  };

  let notificationSession;

  try {
    mongoose.startSession = async () => session;

    Order.findOneAndUpdate = (filter, update, options) => {
      assert.deepEqual(filter, {
        _id: 'order-transition',
        providerId: 'provider-1',
        status: 'accepted',
      });

      assert.equal(update.$set.status, 'fulfilling');
      assert.ok(update.$set.fulfillingAt instanceof Date);
      assert.equal(update.$set.fulfillingAt instanceof Date, true);

      assert.equal(options.session, session);

      return {
        lean: async () => ({
          _id: 'order-transition',
          providerId: 'provider-1',
          customerId: 'customer-1',
          status: 'fulfilling',
        }),
      };
    };

    Notification.create = (documents, options) => {
      assert.equal(documents.length, 1);
      assert.equal(documents[0].userId, 'customer-1');
      assert.equal(documents[0].orderId, 'order-transition');
      notificationSession = options.session;
      return Promise.resolve(documents);
    };

    const result = await lifecycle.transitionOrder({
      orderId: 'order-transition',
      providerId: 'provider-1',
      from: 'accepted',
      to: 'fulfilling',
    });

    assert.equal(result.status, 'fulfilling');
  } finally {
    mongoose.startSession = original.startSession;
    Order.findOneAndUpdate = original.orderFindOneAndUpdate;
    Notification.create = original.notificationCreate;
  }
});

test('completing an order releases the provider busy block inside the transaction', async () => {
  const session = {
    withTransaction: async (work) => work(session),
    endSession: async () => {},
  };

  const original = {
    startSession: mongoose.startSession,
    orderFindOneAndUpdate: Order.findOneAndUpdate,
    userUpdateOne: User.updateOne,
    notificationCreate: Notification.create,
  };

  let releaseSession;

  try {
    mongoose.startSession = async () => session;

    Order.findOneAndUpdate = (filter, update, options) => {
      assert.deepEqual(filter, {
        _id: 'order-complete',
        providerId: 'provider-1',
        status: 'fulfilling',
      });

      assert.equal(update.$set.status, 'completed');

      assert.ok(update.$set.completedAt instanceof Date);

      assert.equal(options.session, session);

      return {
        lean: async () => ({
          _id: 'order-complete',
          providerId: 'provider-1',
          customerId: 'customer-1',
          status: 'completed',
        }),
      };
    };

    User.updateOne = (filter, update, options) => {
      assert.deepEqual(filter, {
        _id: 'provider-1',
      });

      assert.deepEqual(update, {
        $set: { blockedUntil: null },
      });

      releaseSession = options.session;
      return Promise.resolve({ modifiedCount: 1 });
    };

    Notification.create = (documents, options) => {
      assert.equal(documents.length, 1);
      assert.equal(documents[0].type, 'order_completed');
      assert.equal(options.session, session);
      return Promise.resolve(documents);
    };

    const result = await lifecycle.transitionOrder({
      orderId: 'order-complete',
      providerId: 'provider-1',
      from: 'fulfilling',
      to: 'completed',
    });

    assert.equal(result.status, 'completed');
    assert.equal(releaseSession, session);
  } finally {
    mongoose.startSession = original.startSession;
    Order.findOneAndUpdate = original.orderFindOneAndUpdate;
    User.updateOne = original.userUpdateOne;
    Notification.create = original.notificationCreate;
  }
});

test('invalid provider lifecycle transition is rejected before a MongoDB session starts', async () => {
  const originalStartSession = mongoose.startSession;
  let sessionsStarted = 0;

  try {
    mongoose.startSession = async () => {
      sessionsStarted += 1;
      throw new Error('session must not start');
    };

    await assert.rejects(
      () => lifecycle.transitionOrder({
        orderId: 'order-invalid-transition',
        providerId: 'provider-1',
        from: 'accepted',
        to: 'completed',
      }),
      (error) =>
        error instanceof lifecycle.LifecycleConflict
        && error.code === 'INVALID_TRANSITION'
    );

    assert.equal(sessionsStarted, 0);
  } finally {
    mongoose.startSession = originalStartSession;
  }
});

test('socket success emissions remain structurally after awaited lifecycle commits', () => {
  const fs = require('node:fs');
  const path = require('node:path');

  const offersRoute = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'offers.js'),
    'utf8'
  );

  const ordersRoute = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'routes', 'orders.js'),
    'utf8'
  );

  const acceptAwait =
    offersRoute.indexOf('await lifecycle.acceptOffer(');

  const acceptEmit =
    offersRoute.indexOf("emit('offer_accepted'");

  assert.ok(acceptAwait >= 0);
  assert.ok(acceptEmit > acceptAwait);

  const fulfillingAwait =
    ordersRoute.indexOf(
      "await lifecycle.transitionOrder({ orderId: req.params.id, providerId: req.userId, from: 'accepted', to: 'fulfilling' })"
    );

  const fulfillingEmit =
    ordersRoute.indexOf(
      "emit('order_status_changed', { orderId: order._id, status: 'fulfilling' })"
    );

  assert.ok(fulfillingAwait >= 0);
  assert.ok(fulfillingEmit > fulfillingAwait);

  const completeAwait =
    ordersRoute.indexOf(
      'await lifecycle.requestDeliveryConfirmation'
    );

  const completeEmit =
    ordersRoute.indexOf(
      "emit('delivery_confirmation_requested'"
    );

  assert.ok(completeAwait >= 0);
  assert.ok(completeEmit > completeAwait);

  const confirmationAwait =
    ordersRoute.indexOf(
      'await lifecycle.confirmDelivery'
    );

  const confirmationEmit =
    ordersRoute.indexOf(
      "emit('delivery_confirmation_result'"
    );

  assert.ok(confirmationAwait >= 0);
  assert.ok(confirmationEmit > confirmationAwait);
});
