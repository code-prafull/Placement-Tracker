/**
 * Wipe the question bank and import the DSA Union sheet.
 *
 *   node scripts/resetAndImport.js           # backup + wipe + import
 *   node scripts/resetAndImport.js --dry     # only print what would happen
 *
 * Everything deleted is first written to scripts/backup/<timestamp>/ so the
 * old bank can be restored by hand if needed.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

import env from '../src/config/env.js';
import Question from '../src/models/Question.js';
import Revision from '../src/models/Revision.js';
import DailyTask from '../src/models/DailyTask.js';
import DailyActivity from '../src/models/DailyActivity.js';
import User from '../src/models/User.js';
import { importQuestions } from '../src/services/importService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');
const LIST_FILE = path.join(__dirname, 'dsa-union.txt');
const BACKUP_ROOT = path.join(__dirname, 'backup');

/** Same URL shape the sheet used: encoded title, slashes left readable. */
const leetcodeUrl = (title) =>
  `https://leetcode.com/problemset/?search=${encodeURIComponent(title).replace(/%2F/gi, '/')}`;

function readList() {
  const raw = fs.readFileSync(LIST_FILE, 'utf8');
  const rows = [];
  const seen = new Set();
  let dupes = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [phase, topic, ...rest] = line.split('|');
    const title = rest.join('|').trim();
    if (!phase || !topic || !title) continue;
    const key = title.toLowerCase().replace(/\s+/g, ' ');
    if (seen.has(key)) {
      dupes += 1;
      continue;
    }
    seen.add(key);
    rows.push({ title, topic: topic.trim(), phase: phase.trim() });
  }
  return { rows, dupes };
}

function backup(docs, dir, name) {
  const file = path.join(dir, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(docs, null, 2));
  return file;
}

async function main() {
  await mongoose.connect(env.mongoUri);
  console.log(`[db] connected → ${mongoose.connection.name}`);

  const { rows, dupes } = readList();
  console.log(`[list] ${rows.length} unique questions (${dupes} duplicate titles dropped)`);

  const [oldQuestions, oldRevisions, oldActivities, oldTasks, users] = await Promise.all([
    Question.find({}).lean(),
    Revision.find({}).lean(),
    DailyActivity.find({}).lean(),
    DailyTask.find({}).lean(),
    User.find({}).select('email').lean(),
  ]);
  console.log(
    `[current] ${oldQuestions.length} questions · ${oldRevisions.length} revisions · ` +
      `${oldActivities.length} activity days · ${users.length} user(s)`
  );

  if (DRY) {
    console.log('[dry] nothing written');
    await mongoose.disconnect();
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(BACKUP_ROOT, stamp);
  fs.mkdirSync(dir, { recursive: true });
  backup(oldQuestions, dir, 'questions');
  backup(oldRevisions, dir, 'revisions');
  backup(oldActivities, dir, 'daily-activity');
  backup(oldTasks, dir, 'daily-tasks');
  console.log(`[backup] ${dir}`);

  await Promise.all([
    Revision.deleteMany({}),
    Question.deleteMany({}),
    DailyTask.deleteMany({}),
    DailyActivity.deleteMany({}),
  ]);
  console.log('[wipe] old bank, revision history, frozen daily picks and activity cleared');

  const content = JSON.stringify(
    rows.map((r) => ({
      title: r.title,
      topic: r.topic,
      phase: r.phase, // sheet phase → roadmap grouping
      status: 'todo',
      url: leetcodeUrl(r.title),
    }))
  );

  const targets = users.length ? users : [{ email: '(none)' }];
  for (const u of targets) {
    const user = await User.findOne(u.email ? { email: u.email } : {}).select('_id').lean();
    if (!user) continue;
    const result = await importQuestions({
      userId: user._id,
      tzOffset: -330, // IST; irrelevant here since nothing is imported as solved
      content,
      format: 'json',
      defaultStatus: 'todo',
    });
    console.log(
      `[import] ${u.email} → ${result.imported} added, ${result.skipped} skipped` +
        (result.invalid?.length ? `, ${result.invalid.length} invalid` : '')
    );
    if (result.invalid?.length) console.log('  invalid:', JSON.stringify(result.invalid.slice(0, 5)));
    if (result.errors?.length) console.log('  errors:', result.errors);
  }

  const total = await Question.countDocuments({});
  const topics = await Question.distinct('topics');
  console.log(`[done] bank now holds ${total} questions across ${topics.length} topics`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exitCode = 1;
});
