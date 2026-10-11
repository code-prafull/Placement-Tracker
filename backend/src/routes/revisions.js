import { Router } from 'express';
import * as revisions from '../controllers/revisionController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

// Static endpoints first (before /:questionId/...)
router.get('/counts', revisions.counts);
router.get('/today', revisions.todayQueue);
router.get('/overdue', revisions.overdueQueue);
router.get('/upcoming', revisions.upcomingQueue);
router.get('/weak', revisions.weakQueue);
router.get('/queues/:name', revisions.queue);
router.post('/session', revisions.buildSession);

// Session lifecycle
router.post('/:questionId/start', revisions.start);
router.post('/:questionId/complete', revisions.complete);
router.get('/:questionId/history', revisions.history);

export default router;
