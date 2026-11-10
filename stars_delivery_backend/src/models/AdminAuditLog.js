const mongoose = require('mongoose');

const adminAuditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    actorEmail: {
      type: String,
      default: '',
      maxlength: 254,
    },
    method: {
      type: String,
      required: true,
      maxlength: 16,
    },
    path: {
      type: String,
      required: true,
      maxlength: 500,
    },
    statusCode: {
      type: Number,
      default: null,
    },
    ip: {
      type: String,
      default: '',
      maxlength: 100,
    },
    userAgent: {
      type: String,
      default: '',
      maxlength: 500,
    },
    targetParams: {
      type: Object,
      default: {},
    },
    query: {
      type: Object,
      default: {},
    },
    bodyKeys: {
      type: [String],
      default: [],
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);

adminAuditLogSchema.index(
  { createdAt: -1 },
  { expireAfterSeconds: 180 * 24 * 60 * 60 },
);
adminAuditLogSchema.index({ actorId: 1, createdAt: -1 });
adminAuditLogSchema.index({ path: 1, createdAt: -1 });

module.exports = mongoose.model(
  'AdminAuditLog',
  adminAuditLogSchema,
);
