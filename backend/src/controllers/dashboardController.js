import asyncHandler from '../utils/asyncHandler.js';
import { getDashboard } from '../services/dashboardService.js';

/** GET /api/dashboard — single aggregated payload (spec §32) */
export const dashboard = asyncHandler(async (req, res) => {
  const data = await getDashboard(req.userId, req.tzOffset);
  res.json({ success: true, ...data });
});
