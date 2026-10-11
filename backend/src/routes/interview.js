import { Router } from 'express';
import * as interview from '../controllers/interviewController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/', interview.list);
router.post('/start', interview.start);
router.get('/:id', interview.getOne);
router.post('/:id/complete', interview.complete);

export default router;
