const mongoose = require('mongoose');

const broadcastMessageSchema = new mongoose.Schema({
  target: {
    type: String,
    enum: ['drivers', 'users'],
    required: true,
  },
  title: { type: String, required: true, maxlength: 150 },
  body: { type: String, required: true, maxlength: 2000 },
  recipientCount: { type: Number, default: 0 },
  sentAt: { type: Date, default: Date.now },
  // The archive keeps broadcast history for one month.
  expireAt: {
    type: Date,
    default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
});

broadcastMessageSchema.index({ target: 1, sentAt: -1 });
broadcastMessageSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('BroadcastMessage', broadcastMessageSchema);
