const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['product', 'people', 'goods'], required: true },
  description: { type: String, required: true, maxlength: 2000 },
  phone: { type: String, required: true, maxlength: 30 },
  area: { type: String, default: '' },
  governorate: { type: String, default: '' },
  governorateLevel: { type: Boolean, default: false },
  location: { type: String, default: '', maxlength: 500 },
  status: {
    type: String,
    enum: ['pending', 'offered', 'accepted', 'fulfilling', 'completed', 'cancelled', 'expired'],
    default: 'pending',
  },
  price: { type: Number, default: 0 },
  providerEarning: { type: Number, default: 0 },
  platformCommission: { type: Number, default: 0 },
  commissionWaivedAt: { type: Date, default: null },
  estimatedTime: { type: Number, default: 0 },
  acceptedAt: { type: Date, default: null },
  fulfillingAt: { type: Date, default: null },
  completionRequestedAt: { type: Date, default: null },
  deliveryConfirmedAt: { type: Date, default: null },
  deliveryRejectedAt: { type: Date, default: null },
  deliveryRejectionReason: { type: String, default: '' },
  offerWindowExpiredAt: { type: Date, default: null },
  offerSuspendedUntil: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});

orderSchema.index({ providerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ area: 1, status: 1 });
orderSchema.index({ governorate: 1, status: 1, governorateLevel: 1 });
orderSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);