// Permanent deletion of a customer or driver account from the dashboard.
//
// The account document and its personal data are removed from the database:
// push tokens, notifications, support chat, password-recovery requests,
// pending offers and (for drivers) the uploaded licence/ID files. The email,
// phone and public ID are therefore free to register again.
//
// Orders, ratings, reports and commission payments are business records and
// stay; they keep the old account id, which the dashboard shows as a deleted
// account. An account with an order in progress (accepted or being delivered)
// is not deleted: that order would lose its customer or driver mid-way.
const User = require('../models/User');
const Order = require('../models/Order');
const Offer = require('../models/Offer');
const PushToken = require('../models/PushToken');
const Notification = require('../models/Notification');
const ChatMessage = require('../models/ChatMessage');
const PendingProvider = require('../models/PendingProvider');
const PasswordRecoveryChallenge = require('../models/PasswordRecoveryChallenge');
const RejectedOrder = require('../models/RejectedOrder');
const { deleteProviderDocuments } = require('./providerDocumentStorage');

const IN_PROGRESS_STATUSES = ['accepted', 'fulfilling'];
const OPEN_ORDER_STATUSES = ['pending', 'offered'];

class AccountDeletionBlockedError extends Error {
  constructor(message, activeOrders) {
    super(message);
    this.code = 'ACCOUNT_HAS_ACTIVE_ORDERS';
    this.activeOrders = activeOrders;
  }
}

/**
 * Deletes [user] (a User document of role customer or provider) and its
 * personal data. Throws AccountDeletionBlockedError while an order is in
 * progress. Returns a summary of what was removed.
 */
async function permanentlyDeleteAccount(user, { io = null } = {}) {
  if (!user || !['customer', 'provider'].includes(user.role)) {
    throw new Error('Only customer and driver accounts can be deleted here.');
  }

  const ownOrders = user.role === 'provider'
    ? { providerId: user._id }
    : { customerId: user._id };

  const activeOrders = await Order.countDocuments({
    ...ownOrders,
    status: { $in: IN_PROGRESS_STATUSES },
  });
  if (activeOrders > 0) {
    throw new AccountDeletionBlockedError(
      `لا يمكن حذف الحساب لأن لديه ${activeOrders} طلب قيد التنفيذ. أنهِ الطلب أو ألغِه أولاً.`,
      activeOrders,
    );
  }

  let cancelledOrders = 0;
  if (user.role === 'customer') {
    // Open requests would otherwise stay visible to drivers forever.
    const result = await Order.updateMany(
      { customerId: user._id, status: { $in: OPEN_ORDER_STATUSES } },
      { $set: { status: 'cancelled' } },
    );
    cancelledOrders = result.modifiedCount || 0;
    await Offer.updateMany(
      {
        orderId: {
          $in: await Order.distinct('_id', { customerId: user._id, status: 'cancelled' }),
        },
        status: 'pending',
      },
      { $set: { status: 'rejected', rejectionReason: 'customer_deleted' } },
    );
  }

  const removedOffers = user.role === 'provider'
    ? (await Offer.deleteMany({ providerId: user._id, status: 'pending' })).deletedCount || 0
    : 0;

  if (io) {
    try {
      io.to(`user:${user._id}`).emit('account_deleted', {});
    } finally {
      io.in(`user:${user._id}`).disconnectSockets(true);
    }
  }

  await Promise.all([
    PushToken.deleteMany({ userId: user._id }),
    Notification.deleteMany({ userId: user._id }),
    ChatMessage.deleteMany({ userId: user._id }),
    PasswordRecoveryChallenge.deleteOne({ _id: user._id }),
    RejectedOrder.deleteMany({ providerId: user._id }),
    // A leftover sign-up request with the same email would block a new one.
    PendingProvider.deleteMany({ email: user.email }),
  ]);

  if (user.role === 'provider') {
    try {
      await deleteProviderDocuments(user.providerDocuments || []);
    } catch (_) {
      // A missing file must not keep the account in the database.
    }
  }

  await User.deleteOne({ _id: user._id });

  return { cancelledOrders, removedOffers };
}

module.exports = {
  permanentlyDeleteAccount,
  AccountDeletionBlockedError,
};
