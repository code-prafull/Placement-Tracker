import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { getHeatmap, getDayDetail, getStreak, getDayCounts } from '../services/activityService.js';
import { todayKey } from '../utils/dates.js';

/** GET /api/activity/heatmap?weeks=26 */
export const heatmap = asyncHandler(async (req, res) => {
  const weeks = Math.min(104, Math.max(4, Number(req.query.weeks) || 26));
  const days = await getHeatmap(req.userId, weeks, req.tzOffset);
  const totals = days.reduce(
    (acc, d) => ({ revisions: acc.revisions + d.revisions, solved: acc.solved + d.solved }),
    { revisions: 0, solved: 0 }
  );
  res.json({ success: true, weeks, days, totals });
});

/** GET /api/activity/day?date=YYYY-MM-DD — heatmap drill-down */
export const day = asyncHandler(async (req, res) => {
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, 'date must be YYYY-MM-DD');
  const data = await getDayDetail(req.userId, date);
  res.json({ success: true, ...data });
});

/** GET /api/activity/streak */
export const streak = asyncHandler(async (req, res) => {
  res.json({ success: true, ...(await getStreak(req.userId, req.tzOffset)) });
});

/** GET /api/activity/today — habit tracker (solved & revised are SEPARATE) */
export const today = asyncHandler(async (req, res) => {
  const date = todayKey(req.tzOffset);
  const counts = await getDayCounts(req.userId, date);
  res.json({ success: true, ...counts });
});
