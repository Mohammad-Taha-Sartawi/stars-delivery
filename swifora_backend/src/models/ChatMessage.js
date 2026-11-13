const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sender: { type: String, enum: ['user', 'admin'], required: true },
  text: { type: String, required: true, maxlength: 2000 },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

chatMessageSchema.index({ userId: 1, createdAt: 1 });
chatMessageSchema.index({ read: 1, sender: 1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
