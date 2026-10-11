import { Router } from 'express';
import * as topics from '../controllers/topicController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/', topics.list);
router.get('/weak', topics.weak);
router.get('/revision-queue', topics.weakRevision);
router.get('/:name/questions', topics.topicQuestions);

export default router;
