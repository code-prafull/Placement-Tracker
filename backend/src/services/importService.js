import Question from '../models/Question.js';
import ApiError from '../utils/ApiError.js';
import { deriveRevisionStatus } from './spacedRepetition.js';
import { bumpSolvedActivity } from './activityService.js';
import { keyToUtcDate, todayKey } from '../utils/dates.js';

/* -------------------------------------------------------------------------- */
/* Parsing                                                                     */
/* -------------------------------------------------------------------------- */

/** RFC-4180-ish CSV parser (quoted fields, escaped quotes, CRLF, newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const ALIASES = {
  title: ['title', 'question', 'problem', 'name'],
  difficulty: ['difficulty', 'level', 'complexity'],
  topic: ['topic', 'topics', 'tags', 'category'],
  platform: ['platform', 'source'],
  url: ['url', 'link', 'externalurl', 'external_link'],
  description: ['description', 'summary', 'problem statement'],
  approach: ['approach', 'solution approach'],
  notes: ['notes', 'note', 'remark'],
  status: ['status'],
  companies: ['companies', 'company'],
};

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function mapRow(headers, row) {
  const out = {};
  headers.forEach((h, i) => {
    const norm = normalizeHeader(h);
    for (const [key, aliases] of Object.entries(ALIASES)) {
      if (aliases.includes(norm)) {
        out[key] = (row[i] ?? '').toString().trim();
        break;
      }
    }
  });
  return out;
}

function splitTopics(value) {
  if (!value) return [];
  return String(value)
    .split(/[;|]/g)
    .flatMap((v) => (v.includes(',') && !/^[^,]+(,\s*)?[^,]*$/.test(v) ? v.split(',') : [v]))
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeDifficulty(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v.startsWith('e')) return 'Easy';
  if (v.startsWith('h')) return 'Hard';
  return 'Medium';
}

function normalizePlatform(value) {
  const allowed = ['LeetCode', 'GeeksforGeeks', 'HackerRank', 'Codeforces', 'InterviewBit', 'Striver Sheet', 'Other'];
  const v = String(value || '').trim();
  const hit = allowed.find((a) => a.toLowerCase() === v.toLowerCase());
  return hit || (v ? 'Other' : 'LeetCode');
}

/** Rows → question documents ready to insert. */
export function buildImportDocs(rows, userId, tzOffset, defaultStatus = 'solved') {
  const todayKeyStr = todayKey(tzOffset);
  const created = [];
  const invalid = [];

  rows.forEach((raw, index) => {
    const mapped = raw.__mapped || raw;
    const title = String(mapped.title || '').trim();
    if (!title) {
      invalid.push({ line: index + 1, reason: 'Missing title' });
      return;
    }
    const status =
      mapped.status && ['todo', 'solving', 'solved'].includes(String(mapped.status).toLowerCase())
        ? String(mapped.status).toLowerCase()
        : defaultStatus;

    const solved = status === 'solved';
    const revision = solved
      ? {
          nextReviewDate: keyToUtcDate(todayKeyStr),
          lastReviewedAt: null,
          revisionCount: 0,
          memoryStrength: 50,
          interval: 0,
          lastResult: null,
          status: deriveRevisionStatus({
            nextReviewDate: keyToUtcDate(todayKeyStr),
            todayKeyStr,
            memoryStrength: 50,
            interval: 0,
          }),
        }
      : { nextReviewDate: null, memoryStrength: 50, revisionCount: 0, status: 'new' };

    created.push({
      userId,
      title,
      description: mapped.description || '',
      difficulty: normalizeDifficulty(mapped.difficulty),
      topics: splitTopics(mapped.topic || mapped.topics),
      platform: normalizePlatform(mapped.platform),
      externalLink: mapped.url || '',
      companies: splitTopics(mapped.companies || mapped.company),
      notes: mapped.notes || '',
      phase: mapped.phase || '',
      approach: mapped.approach || '',
      status,
      solvedAt: solved ? new Date() : null,
      solvedDateKey: solved ? todayKeyStr : null,
      revision,
    });
  });

  return { created, invalid };
}

/* -------------------------------------------------------------------------- */
/* Import execution                                                            */
/* -------------------------------------------------------------------------- */

export async function importQuestions({ userId, tzOffset, content, format, defaultStatus = 'solved' }) {
  if (!content || !String(content).trim()) throw new ApiError(400, 'No content to import');

  let rows;
  if (format === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new ApiError(400, 'Invalid JSON');
    }
    if (!Array.isArray(parsed)) throw new ApiError(400, 'JSON must be an array of questions');
    rows = parsed.map((r) => ({
      title: r.title,
      difficulty: r.difficulty,
      topic: r.topic || r.topics,
      platform: r.platform,
      url: r.url || r.externalLink,
      description: r.description,
      approach: r.approach,
      notes: r.notes,
      phase: r.phase,
      status: r.status,
      companies: r.companies,
    }));
  } else {
    const csvRows = parseCsv(String(content).replace(/^\uFEFF/, ''));
    if (csvRows.length < 2) throw new ApiError(400, 'CSV needs a header row plus at least one data row');
    const headers = csvRows[0];
    rows = csvRows.slice(1).map((r) => mapRow(headers, r));
  }

  const { created, invalid } = buildImportDocs(rows, userId, tzOffset, defaultStatus);
  if (created.length === 0) {
    return { imported: 0, skipped: 0, invalid, errors: ['No valid rows found'] };
  }

  // De-duplicate against the existing bank (same normalized title).
  const titles = created.map((c) => c.title);
  const existing = await Question.find({
    userId,
    title: { $in: titles },
  })
  .collation({ locale: 'en', strength: 2 })
  .select('title')
  .lean();
  const existingSet = new Set(existing.map((e) => e.title.toLowerCase()));

  const toInsert = [];
  const seen = new Set();
  let skipped = existing.length;
  for (const doc of created) {
    const key = doc.title.toLowerCase();
    if (existingSet.has(key) || seen.has(key)) continue;
    seen.add(key);
    toInsert.push(doc);
  }

  let inserted = [];
  if (toInsert.length) {
    inserted = await Question.insertMany(toInsert, { ordered: false });
    for (const q of inserted) {
      if (q.status === 'solved' && q.solvedDateKey) {
        await bumpSolvedActivity(userId, q.solvedDateKey);
      }
    }
  }

  return {
    imported: inserted.length,
    skipped,
    invalid,
    errors: [],
  };
}
