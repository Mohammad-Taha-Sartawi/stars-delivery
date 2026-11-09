const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  type: { type: String, enum: ['new_offer', 'offer_accepted', 'offer_not_selected', 'driver_taken', 'order_pending', 'new_order', 'offer_submitted', 'order_completed', 'delivery_confirmation', 'delivery_confirmed', 'delivery_rejected', 'report_reply', 'broadcast'], required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  image: { type: String, default: '' },
  read: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  expireAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Notification', notificationSchema);