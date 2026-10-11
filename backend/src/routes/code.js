import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import * as code from '../controllers/codeController.js';

const router = Router();

router.post('/run', protect, code.run);

export default router;
