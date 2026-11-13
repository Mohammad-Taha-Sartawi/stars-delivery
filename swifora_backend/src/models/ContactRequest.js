const mongoose = require('mongoose');

const contactRequestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, default: '', trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, default: '', trim: true, maxlength: 32 },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  // SHA-256 of the access key the guest's app keeps; it lets the guest read
  // our replies and answer back without an account.
  accessTokenHash: { type: String, default: '', select: false },
  // The rest of the conversation after the first message (`text`).
  messages: [{
    sender: { type: String, enum: ['guest', 'admin'], required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    emailed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  }],
  lastMessageAt: { type: Date, default: Date.now },
  read: { type: Boolean, default: false },
  resolved: { type: Boolean, default: false },
  resolvedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

contactRequestSchema.index({ resolved: 1, createdAt: -1 });
contactRequestSchema.index({ read: 1, resolved: 1 });

module.exports = mongoose.model('ContactRequest', contactRequestSchema);
