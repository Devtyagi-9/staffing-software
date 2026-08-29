import { Router, Response } from 'express';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { suggestCandidatesForShift } from '../services/matchingEngine';

const router = Router();

// GET Candidates suggestion ranking for a shift
router.get('/suggest/:shiftId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const candidates = await suggestCandidatesForShift(req.params.shiftId, req.agencyId!);
    res.json({ shift_id: req.params.shiftId, candidates });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
