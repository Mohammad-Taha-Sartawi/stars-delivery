const mongoose = require('mongoose');

const offerSchema = new mongoose.Schema({
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  providerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  price: { type: Number, required: true },
  estimatedTime: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  expiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

offerSchema.index({ orderId: 1, createdAt: -1 });
offerSchema.index({ status: 1, expiresAt: 1 });
// Keep this index non-unique until existing production data has been
// explicitly audited/migrated. Concurrent duplicate prevention is
// enforced transactionally by serializing submissions on the provider.
offerSchema.index({ providerId: 1, orderId: 1 });

module.exports = mongoose.model('Offer', offerSchema);