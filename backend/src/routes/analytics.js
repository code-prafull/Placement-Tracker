import { Router } from 'express';
import { analytics } from '../controllers/analyticsController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.get('/', protect, analytics);

export default router;
