import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { approveClientRequirement, rejectClientRequirement } from '../services/requirementService';

const router = Router();

// GET all Client Requirements
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const status = req.query.status as string;
  const whereClause: any = { client: { payer: { agency_id: req.agencyId } } };
  if (status) {
    whereClause.status = status;
  }

  const requirements = await prisma.clientRequirement.findMany({
    where: whereClause,
    include: {
      client: { include: { payer: true } },
      requirement_skills: { include: { skill: true } },
      shifts: { include: { assignments: { include: { worker: true } } } },
    },
    orderBy: { created_at: 'desc' },
  });
  res.json(requirements);
});

// POST Create Ad-hoc Client Requirement
router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { client_id, shift_date, start_time, end_time, headcount, skill_ids } = req.body;

  const client = await prisma.client.findFirst({
    where: { id: client_id, payer: { agency_id: req.agencyId } },
  });
  if (!client) return res.status(400).json({ error: 'Client not found or access denied.' });

  const requirement = await prisma.clientRequirement.create({
    data: {
      client_id,
      shift_date,
      start_time,
      end_time,
      headcount: Number(headcount || 1),
      status: 'pending_admin_approval',
    },
  });

  if (Array.isArray(skill_ids)) {
    for (const skillId of skill_ids) {
      await prisma.requirementSkill.create({
        data: {
          client_requirement_id: requirement.id,
          skill_id: skillId,
          is_mandatory: true,
        },
      });
    }
  }

  const result = await prisma.clientRequirement.findUnique({
    where: { id: requirement.id },
    include: {
      client: true,
      requirement_skills: { include: { skill: true } },
    },
  });

  res.json(result);
});

// POST Approve Client Requirement (Admin only)
router.post('/:id/approve', authenticateJWT, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await approveClientRequirement(req.params.id, req.user!.id, req.agencyId!);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST Reject Client Requirement (Admin only)
router.post('/:id/reject', authenticateJWT, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await rejectClientRequirement(req.params.id, req.user!.id, req.agencyId!);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
