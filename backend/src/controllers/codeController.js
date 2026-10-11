import asyncHandler from '../utils/asyncHandler.js';
import { runCpp } from '../services/codeRunner.js';

/**
 * POST /api/code/run { language, code, stdin }
 * Compiles & runs C++ on the host (g++). Personal/self-hosted playground.
 */
export const run = asyncHandler(async (req, res) => {
  const language = String(req.body?.language || 'cpp').toLowerCase();
  if (language !== 'cpp' && language !== 'c++') {
    return res.status(400).json({ success: false, message: 'Only C++ is supported right now.' });
  }

  const result = await runCpp(req.body?.code, req.body?.stdin);
  res.json({ success: true, language: 'cpp', ...result });
});
