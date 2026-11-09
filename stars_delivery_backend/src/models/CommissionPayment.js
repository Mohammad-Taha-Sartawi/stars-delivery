const mongoose = require('mongoose');

const commissionPaymentSchema = new mongoose.Schema({
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, default: 'manual_admin' },
  note: { type: String, default: '' },
  paidAt: { type: Date, default: Date.now },
});

commissionPaymentSchema.index({ driverId: 1, paidAt: -1 });

module.exports = mongoose.model('CommissionPayment', commissionPaymentSchema);
