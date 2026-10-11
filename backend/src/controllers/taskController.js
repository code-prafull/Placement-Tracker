import asyncHandler from '../utils/asyncHandler.js';
import { getDailyTask, getWeeklyPerformance } from '../services/taskService.js';

/** GET /api/tasks/today — the 3-question daily task (stable all day). */
export const today = asyncHandler(async (req, res) => {
  const task = await getDailyTask(req.userId, req.tzOffset, 3);
  res.json({ success: true, task });
});

/** GET /api/tasks/weekly — weekly performance % for the habit page. */
export const weekly = asyncHandler(async (req, res) => {
  const performance = await getWeeklyPerformance(req.userId, req.tzOffset, {
    dailyRevisionGoal: req.user?.preferences?.dailyRevisionGoal,
    dailySolveGoal: req.user?.preferences?.dailySolveGoal,
  });
  res.json({ success: true, performance });
});
