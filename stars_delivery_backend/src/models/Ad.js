const mongoose = require('mongoose');

const adSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    body: {
      type: String,
      default: '',
      trim: true,
      maxlength: 300,
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true,
      maxlength: 1000,
    },
    audience: {
      type: String,
      enum: ['all', 'customers', 'providers'],
      default: 'all',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    startsAt: {
      type: Date,
      default: null,
    },
    endsAt: {
      type: Date,
      default: null,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
      max: 9999,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

adSchema.index({
  isActive: 1,
  audience: 1,
  sortOrder: 1,
});
adSchema.index({ startsAt: 1, endsAt: 1 });

module.exports = mongoose.model('Ad', adSchema);
