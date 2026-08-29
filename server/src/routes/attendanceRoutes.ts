import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';
import { clockInWorker, clockOutWorker, approveTimeLog, addTimeLogAdjustment } from '../services/attendanceService';

const router = Router();

// GET all TimeLogs for Dashboard / Approvals
router.get('/logs', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const status = req.query.status as string;
  const whereClause: any = {
    assignment: { shift: { client_requirement: { client: { payer: { agency_id: req.agencyId } } } } },
  };
  if (status) whereClause.status = status;

  const logs = await prisma.timeLog.findMany({
    where: whereClause,
    include: {
      assignment: {
        include: {
          worker: true,
          shift: {
            include: { client_requirement: { include: { client: true } } },
          },
        },
      },
      adjustments: true,
      approver: true,
    },
    orderBy: { clock_in_at: 'desc' },
  });

  res.json(logs);
});

// POST Clock In
router.post('/clock-in', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { assignment_id, lat, lng } = req.body;
  try {
    const result = await clockInWorker({
      assignment_id,
      clock_in_lat: Number(lat || -33.8791),
      clock_in_lng: Number(lng || 151.2205),
      agency_id: req.agencyId!,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST Clock Out
router.post('/clock-out', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { time_log_id, lat, lng } = req.body;
  try {
    const result = await clockOutWorker({
      time_log_id,
      clock_out_lat: Number(lat || -33.8791),
      clock_out_lng: Number(lng || 151.2205),
      agency_id: req.agencyId!,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST Approve TimeLog (Admin / Coordinator)
router.post('/logs/:id/approve', authenticateJWT, requireRole(['admin', 'coordinator']), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await approveTimeLog(req.params.id, req.user!.id, req.agencyId!);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// POST TimeLog Adjustment (For post-billing or corrections)
router.post('/logs/:id/adjustments', authenticateJWT, requireRole(['admin', 'coordinator']), async (req: AuthenticatedRequest, res: Response) => {
  const { reason, original_hours, corrected_hours } = req.body;
  try {
    const result = await addTimeLogAdjustment({
      time_log_id: req.params.id,
      reason,
      original_hours: Number(original_hours),
      corrected_hours: Number(corrected_hours),
      created_by: req.user!.id,
      agency_id: req.agencyId!,
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// GET Hours Analytics & Variance Dashboard Data
router.get('/dashboard-stats', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const logs = await prisma.timeLog.findMany({
    where: {
      assignment: { shift: { client_requirement: { client: { payer: { agency_id: req.agencyId } } } } },
    },
    include: {
      assignment: {
        include: {
          worker: true,
          shift: { include: { client_requirement: { include: { client: true } } } },
        },
      },
      adjustments: true,
    },
  });

  let totalScheduledHours = 0;
  let totalActualHours = 0;
  let totalOvertimeHours = 0;

  const workerStats: Record<string, { worker_name: string; scheduled: number; actual: number; overtime: number }> = {};

  for (const log of logs) {
    const shift = log.assignment.shift;
    const schedHours = (new Date(shift.scheduled_end).getTime() - new Date(shift.scheduled_start).getTime()) / (1000 * 60 * 60);
    totalScheduledHours += schedHours;

    let actHours = 0;
    if (log.clock_in_at && log.clock_out_at) {
      actHours = (new Date(log.clock_out_at).getTime() - new Date(log.clock_in_at).getTime()) / (1000 * 60 * 60);
    } else {
      actHours = schedHours;
    }

    // Apply adjustments if any
    if (log.adjustments.length > 0) {
      const latestAdj = log.adjustments[log.adjustments.length - 1];
      actHours = latestAdj.corrected_hours;
    }

    totalActualHours += actHours;
    const overtime = Math.max(0, actHours - 8); // Daily overtime > 8h
    totalOvertimeHours += overtime;

    const wId = log.assignment.worker.id;
    if (!workerStats[wId]) {
      workerStats[wId] = {
        worker_name: log.assignment.worker.name,
        scheduled: 0,
        actual: 0,
        overtime: 0,
      };
    }
    workerStats[wId].scheduled += schedHours;
    workerStats[wId].actual += actHours;
    workerStats[wId].overtime += overtime;
  }

  res.json({
    summary: {
      total_scheduled_hours: Math.round(totalScheduledHours * 10) / 10,
      total_actual_hours: Math.round(totalActualHours * 10) / 10,
      variance_hours: Math.round((totalActualHours - totalScheduledHours) * 10) / 10,
      total_overtime_hours: Math.round(totalOvertimeHours * 10) / 10,
    },
    by_worker: Object.values(workerStats).map((w) => ({
      ...w,
      scheduled: Math.round(w.scheduled * 10) / 10,
      actual: Math.round(w.actual * 10) / 10,
      overtime: Math.round(w.overtime * 10) / 10,
    })),
  });
});

export default router;
