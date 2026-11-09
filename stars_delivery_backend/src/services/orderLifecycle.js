const mongoose = require('mongoose');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const RejectedOrder = require('../models/RejectedOrder');
const User = require('../models/User');
const { executeTransaction } = require('./transaction');
const { ACCEPTABLE_OFFER_ORDER_STATES, canAcceptOfferRecord, nextProviderStatus } = require('./orderState');
const { normalizeServiceTypes } = require('./providerServiceTypes');
const {
  providerVisibilityFilter,
  orderResponderFilter,
} = require('./orderVisibility');

const ACCEPTABLE_ORDER_STATUSES = ACCEPTABLE_OFFER_ORDER_STATES;
const PROVIDER_ACCEPTANCE_BLOCK_MS = 15 * 60 * 1000;
const OFFER_VALIDITY_MS = 60 * 1000;
const OFFER_COOLDOWN_MS = 60 * 1000;
const OFFER_SUSPENSION_MS = 300 * 1000;
const CONFLICT_MESSAGES = {
  ORDER_NOT_AVAILABLE: 'The order is no longer available for this action.',
  OFFER_NOT_AVAILABLE: 'The offer is no longer available.',
  PROVIDER_BUSY: 'The provider is not currently available.',
  OFFER_COOLDOWN: 'You cannot submit another offer yet.',
  INVALID_TRANSITION: 'The order cannot move to that status.',
};

class LifecycleConflict extends Error {
  constructor(code, orderId, retryAfterSeconds) {
    super(CONFLICT_MESSAGES[code] || 'The operation conflicts with the current state.');
    this.name = 'LifecycleConflict';
    this.code = code;
    this.orderId = orderId?.toString();
    this.retryAfterSeconds = retryAfterSeconds;
    this.status = 409;
  }
}

function conflictResponse(error) {
  return {
    conflict: true,
    code: error.code,
    message: error.message,
    ...(error.orderId ? { orderId: error.orderId } : {}),
    ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
  };
}

function isTransactionUnavailable(error) {
  return error?.code === 20
    || error?.codeName === 'IllegalOperation'
    || /transaction|replica set|mongos/i.test(error?.message || '');
}

async function inTransaction(work) {
  return executeTransaction({ startSession: () => mongoose.startSession(), work });
}

async function suspendIfUnanswered(order, now = new Date()) {
  const activeOffer = await Offer.exists({
    orderId: order._id,
    status: 'pending',
    $or: [
      { expiresAt: { $gt: now } },
      { expiresAt: null },
      { expiresAt: { $exists: false } },
    ],
  });

  if (activeOffer) {
    return null;
  }

  const rejectedProviderIds = await RejectedOrder.find({
    orderId: order._id,
  }).distinct('providerId');

  const responderFilter = {
    role: 'provider',
    status: 'active',
    deleted: { $ne: true },
    isAvailable: { $ne: false },
    $and: [
      {
        $or: [
          { blockedUntil: null },
          { blockedUntil: { $exists: false } },
          { blockedUntil: { $lte: now } },
        ],
      },
      {
        $or: [
          { offerCooldownUntil: null },
          { offerCooldownUntil: { $exists: false } },
          { offerCooldownUntil: { $lte: now } },
        ],
      },
    ],
  };

  if (order.area) {
    const responderVisibility = orderResponderFilter(order);
    if (responderVisibility) {
      responderFilter.$or = responderVisibility.$or;
    }
  }

  if (rejectedProviderIds.length > 0) {
    responderFilter._id = { $nin: rejectedProviderIds };
  }

  const responders = await User.countDocuments(responderFilter);

  if (responders > 0) {
    return null;
  }

  const suspendedUntil = new Date(now.getTime() + OFFER_SUSPENSION_MS);
  const update = await Order.updateOne(
    {
      _id: order._id,
      status: { $in: ['pending', 'offered'] },
      offerSuspendedUntil: null,
    },
    {
      $set: {
        status: 'pending',
        offerWindowExpiredAt: now,
        offerSuspendedUntil: suspendedUntil,
      },
    },
  );

  if (update.modifiedCount !== 1) {
    return null;
  }

  return {
    offerWindowExpiredAt: now,
    offerSuspendedUntil: suspendedUntil,
  };
}

async function expireStaleOffers({ orderId } = {}) {
  const now = new Date();
  const suspensionEnd = new Date(now.getTime() + OFFER_SUSPENSION_MS);
  const filter = { status: 'pending', expiresAt: { $lte: now } };

  if (orderId) {
    filter.orderId = orderId;
  }

  const expired = await Offer.find(filter)
    .select('orderId providerId expiresAt')
    .lean();
  const orderIds = [
    ...new Set(expired.map((offer) => offer.orderId.toString())),
  ];

  if (orderIds.length === 0) {
    return [];
  }

  for (const offer of expired) {
    try {
      await RejectedOrder.updateOne(
        { providerId: offer.providerId, orderId: offer.orderId },
        {
          $setOnInsert: {
            reason: 'offer_expired',
            createdAt: suspensionEnd,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }
  }

  await Offer.deleteMany(filter);

  for (const id of orderIds) {
    const active = await Offer.exists({
      orderId: id,
      status: { $in: ['pending', 'accepted'] },
    });

    if (active) {
      continue;
    }

    const order = await Order.findById(id)
      .select('_id area')
      .lean();

    if (!order) {
      continue;
    }

    const suspended = await suspendIfUnanswered(order, now);

    if (!suspended) {
      await Order.updateOne(
        { _id: id, status: 'offered' },
        {
          $set: {
            status: 'pending',
            offerWindowExpiredAt: null,
            offerSuspendedUntil: null,
          },
        },
      );
    }
  }

  return orderIds;
}

async function finalizeExpiredOrders({ orderId } = {}) {
  const now = new Date();
  const filter = {
    status: 'pending',
    offerSuspendedUntil: { $lte: now },
  };

  if (orderId) {
    filter._id = orderId;
  }

  const result = await Order.updateMany(
    filter,
    { $set: { status: 'expired' } },
  );

  return result.modifiedCount || 0;
}

async function acceptOffer({ offerId, customerId }) {
  return inTransaction(async (session) => {
    const offer = await Offer.findOne({ _id: offerId, status: 'pending' })
      .populate('orderId')
      .session(session)
      .lean();
    if (!offer) throw new LifecycleConflict('OFFER_NOT_AVAILABLE');

    if (offer.expiresAt && offer.expiresAt <= new Date()) {
      await Offer.deleteOne({ _id: offer._id, status: 'pending' }, { session });
      throw new LifecycleConflict(
        'OFFER_NOT_AVAILABLE',
        offer.orderId?._id || offer.orderId,
      );
    }

    const order = offer.orderId;
    if (!order || !canAcceptOfferRecord(offer.status, order.status) || order.customerId.toString() !== customerId.toString()) {
      throw new LifecycleConflict('ORDER_NOT_AVAILABLE', order?._id);
    }

    const blockUntil = new Date(Date.now() + PROVIDER_ACCEPTANCE_BLOCK_MS);
    const provider = await User.findOneAndUpdate({
      _id: offer.providerId,
      role: 'provider',
      status: 'active',
      deleted: { $ne: true },
      $or: [{ blockedUntil: null }, { blockedUntil: { $exists: false } }, { blockedUntil: { $lte: new Date() } }],
    }, { $set: { blockedUntil: blockUntil } }, { new: true, session }).lean();
    if (!provider) throw new LifecycleConflict('PROVIDER_BUSY', order._id);

    const orderUpdate = await Order.updateOne({
      _id: order._id,
      customerId,
      status: { $in: ACCEPTABLE_ORDER_STATUSES },
    }, {
      $set: {
        status: 'accepted',
        providerId: offer.providerId,
        price: offer.price,
        providerEarning: offer.price - 1,
        platformCommission: 1,
        estimatedTime: offer.estimatedTime || 0,
        acceptedAt: new Date(),
        offerWindowExpiredAt: null,
        offerSuspendedUntil: null,
      },
    }, { session });
    if (orderUpdate.modifiedCount !== 1) throw new LifecycleConflict('ORDER_NOT_AVAILABLE', order._id);

    const offerUpdate = await Offer.updateOne({ _id: offer._id, status: 'pending' }, { $set: { status: 'accepted' } }, { session });
    if (offerUpdate.modifiedCount !== 1) throw new LifecycleConflict('OFFER_NOT_AVAILABLE', order._id);

    await Offer.updateMany({ orderId: order._id, _id: { $ne: offer._id } }, { $set: { status: 'rejected' } }, { session });
    await Offer.updateMany({ providerId: offer.providerId, status: 'pending', _id: { $ne: offer._id } }, { $set: { status: 'rejected' } }, { session });

    return {
      orderId: order._id,
      providerId: offer.providerId,
      price: offer.price,
      event: { orderId: order._id, price: offer.price },
    };
  });
}

async function submitOffer({ orderId, providerId, price, estimatedTime }) {
  return inTransaction(async (session) => {
    const now = new Date();
    const cooldownUntil = new Date(now.getTime() + OFFER_COOLDOWN_MS);

    const provider = await User.findOneAndUpdate({
      _id: providerId,
      role: 'provider',
      status: 'active',
      deleted: { $ne: true },
      $or: [{ blockedUntil: null }, { blockedUntil: { $exists: false } }, { blockedUntil: { $lte: now } }],
      $and: [{
        $or: [
          { offerCooldownUntil: null },
          { offerCooldownUntil: { $exists: false } },
          { offerCooldownUntil: { $lte: now } },
        ],
      }],
    }, {
      $inc: { offerSequence: 1 },
      $set: { offerCooldownUntil: cooldownUntil },
    }, { new: true, session }).lean();

    if (!provider) {
      const current = await User.findById(providerId)
        .select('offerCooldownUntil blockedUntil')
        .session(session)
        .lean();

      if (current?.blockedUntil && current.blockedUntil > now) {
        throw new LifecycleConflict('PROVIDER_BUSY', orderId);
      }

      if (current?.offerCooldownUntil && current.offerCooldownUntil > now) {
        throw new LifecycleConflict(
          'OFFER_COOLDOWN',
          orderId,
          Math.max(1, Math.ceil((current.offerCooldownUntil.getTime() - now.getTime()) / 1000)),
        );
      }

      throw new LifecycleConflict('PROVIDER_BUSY', orderId);
    }

      // The provider write above is the serialization point for concurrent
      // submissions by the same provider. If another transaction commits
      // first, withTransaction retries this transaction on a fresh snapshot;
      // this lookup then observes the existing offer and rejects the duplicate.
      // This avoids automatically creating a unique index against unknown
      // existing production data before an explicit duplicate-data audit.
      const rejectedOrder = await RejectedOrder.findOne({ orderId, providerId })
        .select('_id')
        .session(session)
        .lean();
      if (rejectedOrder) throw new LifecycleConflict('OFFER_NOT_AVAILABLE', orderId);

      const existingOffer = await Offer.findOne({ orderId, providerId })
        .select('_id status expiresAt')
        .session(session)
        .lean();
      const expiredExisting = existingOffer
        && existingOffer.status === 'pending'
        && existingOffer.expiresAt
        && existingOffer.expiresAt <= now;

      if (expiredExisting) {
        await Offer.deleteOne({ _id: existingOffer._id, status: 'pending' }, { session });
      } else if (existingOffer) {
        throw new LifecycleConflict('OFFER_NOT_AVAILABLE', orderId);
      }

    const providerServiceTypes = normalizeServiceTypes(provider.serviceTypes);
    const orderFilter = {
      _id: orderId,
      status: { $in: ACCEPTABLE_ORDER_STATUSES },
      $and: [
        {
          $or: [
            { offerSuspendedUntil: null },
            { offerSuspendedUntil: { $exists: false } },
          ],
        },
      ],
    };
    const visibility = providerVisibilityFilter(provider);
    if (visibility) {
      orderFilter.$and.push(visibility);
    }

    if (providerServiceTypes.length > 0) {
      orderFilter.type = { $in: providerServiceTypes };
    }

    const orderUpdate = await Order.updateOne(orderFilter, {
      $set: {
        status: 'offered',
        offerWindowExpiredAt: null,
        offerSuspendedUntil: null,
      },
    }, { session });
    if (orderUpdate.matchedCount !== 1) throw new LifecycleConflict('ORDER_NOT_AVAILABLE', orderId);

    let offer;
    try {
      [offer] = await Offer.create([{
        orderId,
        providerId,
        price,
        estimatedTime: estimatedTime || 0,
        expiresAt: new Date(now.getTime() + OFFER_VALIDITY_MS),
      }], { session });
    } catch (error) {
      if (error?.code === 11000) throw new LifecycleConflict('OFFER_NOT_AVAILABLE', orderId);
      throw error;
    }

    const order = await Order.findById(orderId).select('customerId').session(session).lean();
    return { offer: offer.toObject(), customerId: order.customerId, providerName: provider.fullName, providerPhone: provider.phone };
  });
}

async function resetOrder({ orderId, customerId }) {
  return inTransaction(async (session) => {
    const updated = await Order.findOneAndUpdate({ _id: orderId, customerId, status: { $in: ACCEPTABLE_ORDER_STATUSES } }, {
      $set: {
        status: 'pending',
        providerId: null,
        price: 0,
        providerEarning: 0,
        platformCommission: 0,
        estimatedTime: 0,
        acceptedAt: null,
        offerWindowExpiredAt: null,
        offerSuspendedUntil: null,
      },
    }, { new: true, session }).lean();
    if (!updated) throw new LifecycleConflict('ORDER_NOT_AVAILABLE', orderId);
    await Offer.updateMany({ orderId }, { $set: { status: 'rejected' } }, { session });
    return updated;
  });
}

async function cancelOrder({ orderId, customerId }) {
  return inTransaction(async (session) => {
    const updated = await Order.findOneAndUpdate({ _id: orderId, customerId, status: { $in: ACCEPTABLE_ORDER_STATUSES } }, { $set: { status: 'cancelled' } }, { new: true, session }).lean();
    if (!updated) throw new LifecycleConflict('ORDER_NOT_AVAILABLE', orderId);
    await Offer.updateMany({ orderId, status: 'pending' }, { $set: { status: 'rejected' } }, { session });
    return updated;
  });
}

async function transitionOrder({ orderId, providerId, from, to }) {
  if (nextProviderStatus(from) !== to) throw new LifecycleConflict('INVALID_TRANSITION', orderId);
  return inTransaction(async (session) => {
    const updates = to === 'completed'
      ? { status: to, completedAt: new Date() }
      : { status: to };
    const updated = await Order.findOneAndUpdate({ _id: orderId, providerId, status: from }, { $set: updates }, { new: true, session }).lean();
    if (!updated) throw new LifecycleConflict('INVALID_TRANSITION', orderId);
    if (to === 'completed') {
      await User.updateOne({ _id: providerId }, { $set: { blockedUntil: null } }, { session });
    }
    return updated;
  });
}

module.exports = {
  ACCEPTABLE_ORDER_STATUSES,
  PROVIDER_ACCEPTANCE_BLOCK_MS,
  OFFER_VALIDITY_MS,
  OFFER_SUSPENSION_MS,
  LifecycleConflict,
  conflictResponse,
  isTransactionUnavailable,
  acceptOffer,
  submitOffer,
  expireStaleOffers,
  suspendIfUnanswered,
  finalizeExpiredOrders,
  resetOrder,
  cancelOrder,
  transitionOrder,
};