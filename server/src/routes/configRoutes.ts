import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';

const router = Router();

// GET Labor Config
router.get('/labor', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const config = await prisma.laborConfig.findUnique({
    where: { agency_id: req.agencyId },
  });
  res.json(config);
});

// PUT Labor Config (Admin only)
router.put('/labor', authenticateJWT, requireRole(['admin']), async (req: AuthenticatedRequest, res: Response) => {
  const { max_daily_hours, max_weekly_hours, min_rest_hours, geofence_radius_meters } = req.body;
  const updated = await prisma.laborConfig.upsert({
    where: { agency_id: req.agencyId },
    update: {
      max_daily_hours: Number(max_daily_hours),
      max_weekly_hours: Number(max_weekly_hours),
      min_rest_hours: Number(min_rest_hours),
      geofence_radius_meters: Number(geofence_radius_meters),
    },
    create: {
      agency_id: req.agencyId!,
      max_daily_hours: Number(max_daily_hours || 10),
      max_weekly_hours: Number(max_weekly_hours || 38),
      min_rest_hours: Number(min_rest_hours || 10),
      geofence_radius_meters: Number(geofence_radius_meters || 150),
    },
  });
  res.json(updated);
});

// GET Audit Logs Inspector
router.get('/audit-logs', authenticateJWT, requireRole(['admin', 'coordinator']), async (req: AuthenticatedRequest, res: Response) => {
  const entityType = req.query.entity_type as string;
  const whereClause: any = { agency_id: req.agencyId };
  if (entityType) whereClause.entity_type = entityType;

  const logs = await prisma.auditLog.findMany({
    where: whereClause,
    include: { actor: true },
    orderBy: { created_at: 'desc' },
    take: 100,
  });
  res.json(logs);
});

export default router;
