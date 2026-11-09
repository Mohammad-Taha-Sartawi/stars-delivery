const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sender: { type: String, enum: ['admin', 'other'], required: true },
  text: { type: String, required: true },
  time: { type: String, default: () => new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }
}, { _id: false });

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

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phoneNumbers: [{
    number: { type: String, required: true },
    primary: { type: Boolean, default: false },
  }],
  password: { type: String, required: true, select: false },
  sessionVersion: { type: Number, default: 0, min: 0 },
  providerDocuments: {
    type: [providerDocumentSchema],
    default: [],
    select: false,
  },
  role: { type: String, enum: ['customer', 'provider', 'admin'], required: true },
  area: { type: String, default: '' },
  governorate: { type: String, default: '' },
  governorateLevel: { type: Boolean, default: false },
  publicId: { type: String, unique: true, sparse: true },
  status: { type: String, enum: ['active', 'blocked', 'pending', 'inactive'], default: 'active' },
  serviceTypes: [{ type: String, enum: ['product', 'people', 'goods'] }],
  licenseType: { type: String, default: '' },
  isAvailable: { type: Boolean, default: true },
  commissionPaid: { type: Boolean, default: false },
  commissionPaidAt: { type: Date, default: null },
  commissionResetAt: { type: Date, default: null },
  blockedUntil: { type: Date, default: null },
  offerCooldownUntil: { type: Date, default: null },
  offerSequence: { type: Number, default: 0 },
  deleted: { type: Boolean, default: false },
  privacyPolicy: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  complaints: [{ type: String }],
  frequentItems: [{ type: String }],
  lastLatitude: { type: Number },
  lastLongitude: { type: Number },
  lastLocationUpdate: { type: Date },
  createdAt: { type: Date, default: Date.now },
  // Admin panel fields
  name: { type: String },
  governorate: { type: String },
  messages: [messageSchema]
});

module.exports = mongoose.model('User', userSchema);
