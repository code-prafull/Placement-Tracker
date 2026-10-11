import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import * as interviewService from '../services/interviewService.js';

/** POST /api/interview/start { count?, topics? } */
export const start = asyncHandler(async (req, res) => {
  const session = await interviewService.createInterviewSession(req.userId, req.tzOffset, {
    count: Number(req.body?.count) || 5,
    topics: Array.isArray(req.body?.topics) ? req.body.topics : [],
  });
  res.status(201).json({ success: true, session });
});

/** GET /api/interview/:id */
export const getOne = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid session id');
  const { session, questions } = await interviewService.loadSession(req.userId, req.params.id);
  res.json({ success: true, session: interviewService.serializeSession(session, questions) });
});

/** POST /api/interview/:id/complete { answers: [{questionId, recalled}] } */
export const complete = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(400, 'Invalid session id');
  const session = await interviewService.completeInterview(
    req.userId,
    req.params.id,
    req.body?.answers
  );
  res.json({ success: true, session });
});

/** GET /api/interview — session history */
export const list = asyncHandler(async (req, res) => {
  const sessions = await interviewService.listSessions(req.userId, 15);
  res.json({ success: true, sessions });
});
