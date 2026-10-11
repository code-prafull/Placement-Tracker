import mongoose from 'mongoose';

/** Read model for the roadmap — recomputed from Questions on demand. */
const topicSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: { type: String, required: true, trim: true },
  /** Sheet phase for roadmap grouping ("Phase 1" … "Phase 4", '' = ungrouped). */
  phase: { type: String, default: '', trim: true },
  /** Questions carrying this topic in the bank (solved or not). */
  total: { type: Number, default: 0 },
  solved: { type: Number, default: 0 },
  revised: { type: Number, default: 0 },
  mastered: { type: Number, default: 0 },
  weak: { type: Number, default: 0 },
  memory: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
});

topicSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model('Topic', topicSchema);
