import { Router } from 'express';
import * as activity from '../controllers/activityController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/heatmap', activity.heatmap);
router.get('/day', activity.day);
router.get('/streak', activity.streak);
router.get('/today', activity.today);

export default router;
