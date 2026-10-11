import Question from '../models/Question.js';
import Topic from '../models/Topic.js';
import { categoryFromStrength } from './spacedRepetition.js';

/**
 * Roadmap stats: solved / revised / mastered / weak per topic.
 * Computed directly from the Question collection (single source of truth)
 * and mirrored into the Topic read model.
 *
 * Every topic in the bank is listed (not just the solved ones) so a freshly
 * imported sheet shows its full shape; `solved`/`memory` only count what has
 * actually been practised. `phase` groups topics into the sheet's phases.
 */
export async function getTopicStats(userId) {
  const questions = await Question.find({ userId })
    .select('topics revision phase status')
    .lean();

  const map = new Map();
  for (const q of questions) {
    const strength = q.revision?.memoryStrength ?? 50;
    const count = q.revision?.revisionCount || 0;
    const category = categoryFromStrength(strength);
    const solved = q.status === 'solved';
    for (const raw of q.topics || []) {
      const name = String(raw || '').trim();
      if (!name) continue;
      if (!map.has(name)) {
        map.set(name, {
          name,
          phase: '',
          phaseVotes: new Map(),
          total: 0,
          solved: 0,
          revised: 0,
          mastered: 0,
          weak: 0,
          strengthSum: 0,
          strengthN: 0,
        });
      }
      const t = map.get(name);
      t.total += 1;

      const phase = String(q.phase || '').trim();
      if (phase) t.phaseVotes.set(phase, (t.phaseVotes.get(phase) || 0) + 1);

      if (!solved) continue;
      t.solved += 1;
      if (count > 0) {
        t.revised += 1;
        t.strengthSum += strength;
        t.strengthN += 1;
      }
      const isWeak =
        category !== 'Mastered' &&
        (category === 'Weak' ||
          category === 'Forgotten' ||
          (q.revision?.weakFlags || []).length > 0);
      if (category === 'Mastered') t.mastered += 1;
      if (isWeak) t.weak += 1;
    }
  }

  const stats = [...map.values()]
    .map((t) => {
      // The phase most of the topic's questions declare wins; '' = ungrouped.
      let phase = '';
      let best = 0;
      for (const [p, n] of t.phaseVotes) {
        if (n > best) {
          phase = p;
          best = n;
        }
      }
      const { phaseVotes, strengthSum, strengthN, ...rest } = t;
      return {
        ...rest,
        phase,
        weak: Math.min(t.weak, t.solved),
        memory: strengthN > 0 ? Math.round(strengthSum / strengthN) : null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // Mirror into the Topic read model (best-effort — never blocks the read).
  try {
    const existing = await Topic.find({ userId }).select('name').lean();
    const names = new Set(stats.map((s) => s.name));
    const ops = stats.map((s) => {
      const { name, ...rest } = s;
      return {
        updateOne: {
          filter: { userId, name },
          update: { $set: { ...rest, updatedAt: new Date() }, $setOnInsert: { userId, name } },
          upsert: true,
        },
      };
    });
    for (const e of existing) {
      if (!names.has(e.name)) {
        ops.push({ deleteOne: { filter: { userId, name: e.name } } });
      }
    }
    if (ops.length) await Topic.bulkWrite(ops, { ordered: false });
  } catch (err) {
    console.warn('[topics] mirror failed:', err.message);
  }

  return stats;
}

/** Weakest topics by memory (only topics with at least one revised question). */
export async function getWeakTopics(userId, limit = 5) {
  const stats = await getTopicStats(userId);
  return stats
    .filter((t) => t.memory !== null && t.revised > 0)
    .sort((a, b) => a.memory - b.memory)
    .slice(0, limit);
}
