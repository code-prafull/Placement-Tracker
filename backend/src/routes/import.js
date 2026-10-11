import { Router } from 'express';
import * as importer from '../controllers/importController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

router.get('/template', importer.template);
router.post('/csv', importer.importCsv);
router.post('/json', importer.importJson);

export default router;
