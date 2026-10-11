import asyncHandler from '../utils/asyncHandler.js';
import { getAnalytics } from '../services/analyticsService.js';

/** GET /api/analytics — full stats + chart series (spec §20) */
export const analytics = asyncHandler(async (req, res) => {
  const data = await getAnalytics(req.userId, req.tzOffset);
  res.json({ success: true, ...data });
});
