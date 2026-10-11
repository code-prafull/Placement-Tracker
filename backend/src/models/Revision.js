import mongoose from 'mongoose';

export const RECALL_RESULTS = ['forgot', 'hard', 'good', 'easy'];

const revisionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
      index: true,
    },

    /** 'in_progress' → a live session; 'completed' → immutable history row. */
    status: {
      type: String,
      enum: ['in_progress', 'completed'],
      default: 'in_progress',
      index: true,
    },

    startedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },

    /** Local day key (YYYY-MM-DD) of completion — powers heatmap/streaks. */
    dateKey: { type: String, default: null, index: true },

    result: { type: String, enum: [...RECALL_RESULTS, null], default: null },

    previousInterval: { type: Number, default: 0 },
    nextInterval: { type: Number, default: 0 },
    nextReviewDate: { type: Date, default: null },

    memoryStrengthBefore: { type: Number, default: null },
    memoryStrengthAfter: { type: Number, default: null },

    /** The approach the user typed from memory during active recall. */
    recalledApproach: { type: String, default: '' },

    /** The code the user wrote from memory during the revision session. */
    recalledCode: { type: String, default: '' },

    /** Optional mistake captured while revising (also mirrored on the question). */
    mistake: {
      forgotWhat: { type: String, default: '' },
      gotStuck: { type: String, default: '' },
      mistake: { type: String, default: '' },
      insight: { type: String, default: '' },
    },

    mode: { type: String, enum: ['quick', 'deep', 'random', 'interview', 'bulk'], default: 'quick' },
    secondsSpent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Rule 9: the database itself refuses duplicate live sessions per question.
revisionSchema.index(
  { userId: 1, questionId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' } }
);
revisionSchema.index({ userId: 1, reviewedAt: -1 });
revisionSchema.index({ userId: 1, dateKey: -1 });
revisionSchema.index({ userId: 1, result: 1 });

/** Completed revision rows are immutable (Rule 3). The only write ever
 *  allowed on the transition is in_progress → completed (query targets an
 *  in_progress row). Once completed, its result/timestamps are frozen. */
revisionSchema.pre('findOneAndUpdate', function disallowHistoryEdit(next) {
  const query = this.getQuery() || {};
  const update = this.getUpdate() || {};
  const set = update.$set || {};
  const freezesResult = set.result !== undefined || set.reviewedAt !== undefined;
  if (query.status === 'completed' && freezesResult) {
    return next(new Error('Revision history cannot be modified after completion'));
  }
  next();
});

revisionSchema.pre('save', function disallowCompletedEdit(next) {
  if (!this.isNew && this.status === 'completed' && this.isModified('result')) {
    return next(new Error('Revision history cannot be modified after completion'));
  }
  next();
});

export default mongoose.model('Revision', revisionSchema);
