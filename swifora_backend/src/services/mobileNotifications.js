const Notification = require('../models/Notification');
const { sendPushToUser } = require('./pushNotifications');

async function emitUnreadNotificationCount(io, userId) {
  if (!io || !userId) return;

  const unreadCount = await Notification.countDocuments({
    userId,
    read: false,
  });
  io.to(`user:${userId}`).emit('notification_count', { unreadCount });
}

async function createUserNotification({
  io,
  userId,
  orderId = null,
  type,
  title,
  body,
  pinned = false,
  expireAt = null,
  push = true,
}) {
  if (!userId) return null;

  const notification = await Notification.create({
    userId,
    ...(orderId ? { orderId } : {}),
    type,
    title,
    body,
    pinned,
    ...(expireAt ? { expireAt } : {}),
  });

  await emitUnreadNotificationCount(io, userId).catch(() => {});
  if (push) {
    sendPushToUser(userId, {
      title,
      body,
      data: {
        type,
        ...(orderId ? { orderId: orderId.toString() } : {}),
      },
    }).catch(() => {});
  }
  return notification;
}

module.exports = {
  createUserNotification,
  emitUnreadNotificationCount,
};
