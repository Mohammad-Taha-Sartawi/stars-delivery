const mongoose = require('mongoose');

const rejectedOrderSchema = new mongoose.Schema({
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  reason: {
    type: String,
    enum: ['driver_rejected', 'offer_expired'],
    default: 'driver_rejected',
  },
  createdAt: { type: Date, default: Date.now },
});

rejectedOrderSchema.index({ providerId: 1, orderId: 1 }, { unique: true });
rejectedOrderSchema.index({ providerId: 1, createdAt: -1 });

module.exports = mongoose.model('RejectedOrder', rejectedOrderSchema);
