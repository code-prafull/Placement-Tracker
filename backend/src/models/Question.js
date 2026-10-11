import mongoose from 'mongoose';

export const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];
export const QUESTION_STATUSES = ['todo', 'solving', 'solved'];
export const MEMORY_CATEGORIES = ['Forgotten', 'Weak', 'Learning', 'Strong', 'Mastered'];

const mistakeSchema = new mongoose.Schema(
  {
    forgotWhat: { type: String, default: '' },
    gotStuck: { type: String, default: '' },
    mistake: { type: String, default: '' },
    insight: { type: String, default: '' },
    // The revision result that produced this mistake record.
    result: { type: String, enum: ['forgot', 'hard', 'good', 'easy'], default: null },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

const revisionStateSchema = new mongoose.Schema(
  {
    /** UTC-midnight of the local day this question is next due. */
    nextReviewDate: { type: Date, index: true },
    lastReviewedAt: { type: Date, default: null },
    /** Total completed revisions (never reset). */
    revisionCount: { type: Number, default: 0, min: 0 },
    /** 0-100, computed ONLY from revision history (server side). */
    memoryStrength: { type: Number, default: 50, min: 0, max: 100 },
    /** Queue status derived on every write: new | scheduled | due | overdue | mastered */
    status: {
      type: String,
      enum: ['new', 'scheduled', 'due', 'overdue', 'mastered'],
      default: 'new',
      index: true,
    },
    /** Current spacing in days (gap that produced the next review date). */
    interval: { type: Number, default: 0, min: 0 },
    /** Last recall rating. */
    lastResult: {
      type: String,
      enum: ['forgot', 'hard', 'good', 'easy', null],
      default: null,
    },
    /** Consecutive good/easy ratings. */
    resultStreak: { type: Number, default: 0 },
    /** Denormalized weakness flags recomputed after each revision. */
    weakFlags: [{ type: String, enum: ['low_memory', 'recent_forgot', 'repeated_hard'] }],
    /** Total minutes spent in revision sessions (from start → complete). */
    totalRevisionSeconds: { type: Number, default: 0 },
  },
  { _id: false }
);

/** LeetCode-style worked example: Input / Output / Explanation. */
const exampleSchema = new mongoose.Schema(
  {
    input: { type: String, default: '', trim: true },
    output: { type: String, default: '', trim: true },
    explanation: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true },

    /** LeetCode-style statement sections (all optional). */
    examples: [exampleSchema],
    constraints: [{ type: String, trim: true }],
    hints: [{ type: String, trim: true }],

    platform: {
      type: String,
      default: 'LeetCode',
      trim: true,
      enum: {
        values: ['LeetCode', 'GeeksforGeeks', 'HackerRank', 'Codeforces', 'InterviewBit', 'Striver Sheet', 'Other'],
        message: '{VALUE} is not a supported platform',
      },
    },
    externalLink: { type: String, default: '', trim: true },

    /** Sheet phase ("Phase 1" … "Phase 4") — groups topics on the roadmap. */
    phase: { type: String, default: '', trim: true, index: true },

    difficulty: { type: String, enum: DIFFICULTIES, default: 'Medium' },
    topics: [{ type: String, trim: true }],
    companies: [{ type: String, trim: true }],

    status: { type: String, enum: QUESTION_STATUSES, default: 'solving', index: true },

    notes: { type: String, default: '', trim: true },
    approach: { type: String, default: '', trim: true },
    code: { type: String, default: '', trim: true },
    language: { type: String, default: 'JavaScript', trim: true },
    timeComplexity: { type: String, default: '', trim: true },
    spaceComplexity: { type: String, default: '', trim: true },

    solvedAt: { type: Date, default: null },
    /** Local day key the question was marked solved on (for habit stats). */
    solvedDateKey: { type: String, default: null },

    revision: { type: revisionStateSchema, default: () => ({}) },
    mistakes: [mistakeSchema],
  },
  { timestamps: true }
);

// --- Indexes (per spec §29) -------------------------------------------------
questionSchema.index({ userId: 1, createdAt: -1 });
questionSchema.index({ userId: 1, 'revision.nextReviewDate': 1 });
questionSchema.index({ userId: 1, 'revision.memoryStrength': 1 });
questionSchema.index({ userId: 1, 'revision.status': 1 });
questionSchema.index({ userId: 1, 'revision.lastReviewedAt': -1 });
questionSchema.index({ userId: 1, topics: 1 });
questionSchema.index({ userId: 1, difficulty: 1 });
questionSchema.index(
  { userId: 1, title: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

/** Memory bucket derived from the computed strength (display + tabs). */
questionSchema.virtual('memoryCategory').get(function memoryCategory() {
  const s = this.revision?.memoryStrength ?? 50;
  if (s < 25) return 'Forgotten';
  if (s < 45) return 'Weak';
  if (s < 65) return 'Learning';
  if (s < 85) return 'Strong';
  return 'Mastered';
});

questionSchema.set('toJSON', { virtuals: true });
questionSchema.set('toObject', { virtuals: true });

export default mongoose.model('Question', questionSchema);
