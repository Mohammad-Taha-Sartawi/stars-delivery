const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  sender: { type: String, enum: ['admin', 'reporter'], required: true },
  text: { type: String, required: true },
  time: { type: String, default: () => new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }
}, { _id: false });

const reportSchema = new mongoose.Schema({
  reportId: { type: String, required: true, unique: true },
  reportType: { type: String, enum: ['driver', 'user'], required: true },
  reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reporter: { type: String, required: true },
  reportedPublicId: { type: String, required: true },
  reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  category: { type: String, required: true },
  date: { type: String, default: () => new Date().toISOString().split('T')[0] },
  status: { type: String, enum: ['in-review', 'in-progress', 'resolved', 'rejected'], default: 'in-review' },
  content: { type: String, required: true },
  replies: [replySchema]
}, { timestamps: true });

reportSchema.index({ reportType: 1, status: 1 });

module.exports = mongoose.model('Report', reportSchema);
