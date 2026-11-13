const mongoose = require('mongoose');

const commissionSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    unique: true,
    default: 'platform',
  },
  type: {
    type: String,
    enum: ['fixed', 'percent'],
    default: 'fixed',
  },
  value: {
    type: Number,
    default: 1,
    min: 0,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('CommissionSetting', commissionSettingSchema);
