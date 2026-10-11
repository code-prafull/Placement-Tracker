import { Router } from 'express';
import * as questions from '../controllers/questionController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

router.use(protect);

// Static paths BEFORE :id
router.get('/', questions.list);
router.post('/', questions.create);
router.get('/facets', questions.facets);
router.post('/bulk', questions.bulk);

router.get('/:id', questions.getOne);
router.put('/:id', questions.update);
router.delete('/:id', questions.remove);
router.post('/:id/solve', questions.markSolved);

export default router;
