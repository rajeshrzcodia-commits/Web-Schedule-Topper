const mongoose = require('mongoose');
const { config } = require('../config/env');

const scanResultSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    status: {
      type: String,
      enum: ['up', 'down'],
      required: true,
      index: true,
    },
    statusCode: {
      type: Number,
      default: null,
    },
    responseTimeMs: {
      type: Number,
      default: null,
    },
    error: {
      type: String,
      default: null,
    },
    consecutiveFailures: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: { createdAt: 'timestamp', updatedAt: false },
  }
);

scanResultSchema.index({ url: 1, timestamp: -1 });

const retentionSeconds = Math.max(1, config.scan.retentionDays) * 24 * 60 * 60;
scanResultSchema.index(
  { timestamp: 1 },
  { expireAfterSeconds: retentionSeconds, name: 'scan_result_ttl' }
);

scanResultSchema.statics.getLastResult = async function (url) {
  return this.findOne({ url }).sort({ timestamp: -1 }).lean();
};

scanResultSchema.statics.getRecentResults = async function (
  url,
  limit = 50
) {
  return this.find({ url })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
};

scanResultSchema.statics.getLatestPerUrl = async function () {
  return this.aggregate([
    { $sort: { timestamp: -1 } },
    { $group: { _id: '$url', doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { timestamp: -1 } },
  ]).exec();
};

const ScanResult = mongoose.model('ScanResult', scanResultSchema);

module.exports = ScanResult;
