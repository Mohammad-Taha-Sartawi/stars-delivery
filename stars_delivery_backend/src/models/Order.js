const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, enum: ['product', 'people', 'goods'], required: true },
  description: { type: String, required: true },
  phone: { type: String, required: true },
  images: [{ type: String }],
  area: { type: String, default: '' },
  location: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'offered', 'accepted', 'fulfilling', 'completed', 'cancelled'],
    default: 'pending',
  },
  price: { type: Number, default: 0 },
  providerEarning: { type: Number, default: 0 },
  platformCommission: { type: Number, default: 0 },
  estimatedTime: { type: Number, default: 0 },
  acceptedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});

orderSchema.index({ providerId: 1, status: 1, createdAt: -1 });
orderSchema.index({ area: 1, status: 1 });
orderSchema.index({ customerId: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);