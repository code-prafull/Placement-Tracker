import asyncHandler from '../utils/asyncHandler.js';
import { importQuestions } from '../services/importService.js';

/** POST /api/import/csv  body: { content, defaultStatus? } */
export const importCsv = asyncHandler(async (req, res) => {
  const { content, defaultStatus } = req.body || {};
  const result = await importQuestions({
    userId: req.userId,
    tzOffset: req.tzOffset,
    content,
    format: 'csv',
    defaultStatus,
  });
  res.status(201).json({ success: true, format: 'csv', ...result });
});

/** POST /api/import/json  body: { content, defaultStatus? } */
export const importJson = asyncHandler(async (req, res) => {
  const { content, defaultStatus } = req.body || {};
  const result = await importQuestions({
    userId: req.userId,
    tzOffset: req.tzOffset,
    content,
    format: 'json',
    defaultStatus,
  });
  res.status(201).json({ success: true, format: 'json', ...result });
});

/** GET /api/import/template — downloadable CSV template */
export const template = asyncHandler(async (req, res) => {
  const csv =
    'title,difficulty,topic,platform,url,description,approach,notes\n' +
    '"Two Sum, Classic",Easy,Array; Hashing,LeetCode,https://leetcode.com/problems/two-sum/,"Find two indices whose values reach a target.","One pass with a hash map of seen values.","Remember to check duplicates before inserting."\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="dsaforge-import-template.csv"');
  res.send(csv);
});
