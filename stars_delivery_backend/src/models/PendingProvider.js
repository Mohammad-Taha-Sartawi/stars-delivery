const mongoose = require('mongoose');

const providerDocumentSchema = new mongoose.Schema({
  kind: {
    type: String,
    enum: [
      'identity_document',
      'driver_license',
    ],
    required: true,
  },
  storageKey: {
    type: String,
    required: true,
  },
  contentType: {
    type: String,
    enum: [
      'image/jpeg',
      'image/png',
    ],
    required: true,
  },
  size: {
    type: Number,
    required: true,
    min: 1,
    max: 5 * 1024 * 1024,
  },
  sha256: {
    type: String,
    required: true,
    match: /^[a-f0-9]{64}$/,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  _id: false,
});

const pendingProviderSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, required: true },
  password: { type: String, required: true, select: false },
  area: { type: String, default: '' },
  governorate: { type: String, default: '' },
  serviceTypes: [{ type: String, enum: ['product', 'people', 'goods'] }],
  licenseType: { type: String, default: '' },
  providerDocuments: {
    type: [providerDocumentSchema],
    default: [],
    select: false,
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('PendingProvider', pendingProviderSchema);
