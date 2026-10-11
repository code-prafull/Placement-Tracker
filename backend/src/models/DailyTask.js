import mongoose from 'mongoose';

/**
 * The 3 questions picked for a user's daily task.
 *
 * The pick is computed once per local day and then frozen, so solving a
 * question never reshuffles today's set (a solved question just gets a green
 * tick — it is not swapped out for another one).
 */
const dailyTaskSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  /** YYYY-MM-DD in the user's local timezone. */
  dateKey: { type: String, required: true },
  /** Frozen question ids for that day (in pick order). */
  questionIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Question',
    required: true,
    validate: [(v) => Array.isArray(v) && v.length > 0, 'day must have at least one question'],
  },
});

dailyTaskSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

export default mongoose.model('DailyTask', dailyTaskSchema);
