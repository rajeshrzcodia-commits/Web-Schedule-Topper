const mongoose = require('mongoose');
const { config } = require('../config/env');

const emailLogSchema = new mongoose.Schema(
  {
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Target',
      default: null,
      index: true,
    },
    scanResultId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScanResult',
      default: null,
      index: true,
    },
    targetUrl: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    targetName: {
      type: String,
      trim: true,
      default: '',
    },
    eventType: {
      type: String,
      enum: ['confirmation', 'alert'],
      required: true,
      index: true,
    },
    alertType: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['sent', 'failed', 'skipped'],
      required: true,
      index: true,
    },
    recipientCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    error: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'timestamp', updatedAt: false },
  }
);

emailLogSchema.index({ timestamp: -1 });
emailLogSchema.index({ scanResultId: 1, timestamp: -1 });

const retentionSeconds = Math.max(1, config.scan.retentionDays) * 24 * 60 * 60;
emailLogSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: retentionSeconds, name: 'email_log_ttl' }
);

module.exports = mongoose.model('EmailLog', emailLogSchema);
