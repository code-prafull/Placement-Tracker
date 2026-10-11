import mongoose from 'mongoose';

/**
 * Per-user per-day aggregate of activity.
 * Solved and revised are tracked as SEPARATE metrics (spec §13).
 * Revision history itself is the source of truth; this is a fast read model.
 */
const dailyActivitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  /** YYYY-MM-DD in the user's local timezone. */
  date: { type: String, required: true, index: true },
  solvedCount: { type: Number, default: 0, min: 0 },
  revisedCount: { type: Number, default: 0, min: 0 },
  results: {
    forgot: { type: Number, default: 0 },
    hard: { type: Number, default: 0 },
    good: { type: Number, default: 0 },
    easy: { type: Number, default: 0 },
  },
});

dailyActivitySchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.model('DailyActivity', dailyActivitySchema);
