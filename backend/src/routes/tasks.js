import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import * as tasks from '../controllers/taskController.js';

const router = Router();

router.get('/today', protect, tasks.today);
router.get('/weekly', protect, tasks.weekly);

export default router;
