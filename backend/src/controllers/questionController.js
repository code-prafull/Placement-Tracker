import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as questionService from '../services/questionService.js';
import { getQuestionHistory } from '../services/revisionService.js';
import Question from '../models/Question.js';
import { todayKey } from '../utils/dates.js';

/** GET /api/questions */
export const list = asyncHandler(async (req, res) => {
  const data = await questionService.listQuestions(req.userId, req.tzOffset, req.query);
  res.json({ success: true, ...data });
});

/** GET /api/questions/facets — filter dropdown options */
export const facets = asyncHandler(async (req, res) => {
  const data = await questionService.getFacets(req.userId);
  res.json({ success: true, ...data });
});

/** GET /api/questions/:id — includes full revision history */
export const getOne = asyncHandler(async (req, res) => {
  const question = await Question.findOne({ _id: req.params.id, userId: req.userId });
  if (!question) throw new ApiError(404, 'Question not found');
  const history = await getQuestionHistory(req.userId, req.params.id);
  const todayKeyStr = todayKey(req.tzOffset);
  res.json({
    success: true,
    question: questionService.withDerived(question, todayKeyStr),
    history,
  });
});

/** POST /api/questions */
export const create = asyncHandler(async (req, res) => {
  const question = await questionService.createQuestion(req.userId, req.tzOffset, req.body || {});
  res.status(201).json({
    success: true,
    question,
    message:
      question.status === 'solved'
        ? 'Solved today ✓ — first revision scheduled for today'
        : 'Question added',
  });
});

/** PUT /api/questions/:id */
export const update = asyncHandler(async (req, res) => {
  const question = await questionService.updateQuestion(
    req.userId,
    req.tzOffset,
    req.params.id,
    req.body || {}
  );
  res.json({ success: true, question });
});

/** DELETE /api/questions/:id */
export const remove = asyncHandler(async (req, res) => {
  const result = await questionService.deleteQuestion(req.userId, req.tzOffset, req.params.id);
  res.json({ success: true, ...result });
});

/** POST /api/questions/:id/solve — mark as solved & schedule first revision */
export const markSolved = asyncHandler(async (req, res) => {
  const question = await questionService.updateQuestion(req.userId, req.tzOffset, req.params.id, {
    status: 'solved',
    touchSolvedDate: true, // re-stamp solvedDateKey so it counts for today's task
  });
  res.json({ success: true, question, message: 'Solved today ✓ — first revision scheduled for today' });
});

/** POST /api/questions/bulk — bulk operations (spec §25) */
export const bulk = asyncHandler(async (req, res) => {
  const { action, ids, payload } = req.body || {};
  const result = await questionService.bulkAction(req.userId, req.tzOffset, { action, ids, payload });
  res.json({ success: true, ...result });
});
