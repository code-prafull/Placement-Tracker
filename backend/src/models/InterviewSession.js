import mongoose from 'mongoose';

const interviewSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    questionIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    /** topic name → number of questions picked from it. */
    topicBreakdown: [{ type: mongoose.Schema.Types.Mixed }],
    status: {
      type: String,
      enum: ['active', 'completed'],
      default: 'active',
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    /** [{ questionId, recalled }] */
    answers: [
      {
        questionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },
        recalled: { type: Boolean, default: false },
        _id: false,
      },
    ],
    score: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    weakArea: { type: String, default: '' },
  },
  { timestamps: true }
);

interviewSessionSchema.index({ userId: 1, startedAt: -1 });

export default mongoose.model('InterviewSession', interviewSessionSchema);
