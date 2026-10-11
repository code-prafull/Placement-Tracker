/**
 * One-off: the sheet phase was imported into `notes`; move it to the real
 * `phase` field so the Notes tab stays the user's own space.
 *
 *   node scripts/backfillPhase.js
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import env from '../src/config/env.js';
import Question from '../src/models/Question.js';

async function main() {
  await mongoose.connect(env.mongoUri);

  const docs = await Question.find({
    $or: [{ phase: '' }, { phase: { $exists: false } }],
  })
    .select('notes phase')
    .lean();
  let moved = 0;
  for (const d of docs) {
    const note = String(d.notes || '').trim();
    if (!/^Phase\s+\d+$/i.test(note)) continue;
    await Question.updateOne(
      { _id: d._id },
      { $set: { phase: note.replace(/^phase/i, 'Phase').replace(/\s+/g, ' ') }, $unset: { notes: '' } }
    );
    moved += 1;
  }

  const phases = await Question.aggregate([
    { $group: { _id: '$phase', n: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  console.log(`[backfill] moved ${moved} questions → phase field`);
  console.log(
    '[phases]',
    phases.map((p) => `${p._id || '(none)'}=${p.n}`).join(' · ')
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exitCode = 1;
});
