const mongoose = require('mongoose');

const targetSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, 'URL is required'],
      trim: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      default: '',
    },
    scheduleTime: {
      type: String,
      default: '00:00',
    },
    frequency: {
      type: String,
      trim: true,
      default: '',
    },
    alertEmail: {
      type: String,
      trim: true,
      default: '',
    },
    expectedStatusCode: {
      type: Number,
      default: 200,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

/**
 * Derive `name` from the URL hostname when it is not explicitly provided.
 */
targetSchema.pre('save', function (next) {
  if (!this.name) {
    try {
      this.name = new URL(this.url).hostname || '';
    } catch {
      this.name = '';
    }
  }
  next();
});

const Target = mongoose.model('Target', targetSchema);

module.exports = Target;