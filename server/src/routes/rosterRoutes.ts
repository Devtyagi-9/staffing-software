import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { recordAuditLog } from '../services/auditLogger';

const router = Router();

// GET Roster Shifts for Calendar View
router.get('/shifts', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { start_date, end_date } = req.query;

  const whereClause: any = {
    client_requirement: { client: { payer: { agency_id: req.agencyId } } },
  };

  if (start_date && end_date) {
    const start = new Date(`${start_date}T00:00:00.000Z`);
    const end = new Date(`${end_date}T23:59:59.999Z`);
    whereClause.scheduled_start = { gte: start, lte: end };
  }

  const shifts = await prisma.shift.findMany({
    where: whereClause,
    include: {
      client_requirement: {
        include: {
          client: { include: { payer: true } },
          requirement_skills: { include: { skill: true } },
        },
      },
      assignments: {
        include: {
          worker: { include: { worker_skills: { include: { skill: true } } } },
          time_logs: true,
        },
      },
    },
    orderBy: { scheduled_start: 'asc' },
  });

  // Calculate advisory overlap flags across all confirmed assignments
  const confirmedAssignments = await prisma.assignment.findMany({
    where: {
      status: 'confirmed',
      shift: { client_requirement: { client: { payer: { agency_id: req.agencyId } } } },
    },
    include: { shift: true, worker: true },
  });

  // Identify double-booked workers
  const doubleBookedWorkerIds = new Set<string>();
  for (let i = 0; i < confirmedAssignments.length; i++) {
    for (let j = i + 1; j < confirmedAssignments.length; j++) {
      const a = confirmedAssignments[i];
      const b = confirmedAssignments[j];
      if (a.worker_id === b.worker_id) {
        const aStart = new Date(a.shift.scheduled_start);
        const aEnd = new Date(a.shift.scheduled_end);
        const bStart = new Date(b.shift.scheduled_start);
        const bEnd = new Date(b.shift.scheduled_end);

        if (aStart < bEnd && aEnd > bStart) {
          doubleBookedWorkerIds.add(a.worker_id);
        }
      }
    }
  }

  const shiftsWithConflicts = shifts.map((shift) => {
    const hasDoubleBookedWorker = shift.assignments.some(
      (as) => as.status === 'confirmed' && doubleBookedWorkerIds.has(as.worker_id)
    );
    return {
      ...shift,
      has_conflict_warning: hasDoubleBookedWorker,
    };
  });

  res.json({ shifts: shiftsWithConflicts, doubleBookedWorkerIds: Array.from(doubleBookedWorkerIds) });
});

// POST Assign Worker to Shift
router.post('/assign', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { shift_id, worker_id } = req.body;

  const shift = await prisma.shift.findUnique({
    where: { id: shift_id },
    include: { client_requirement: { include: { client: { include: { payer: true } } } } },
  });

  if (!shift || shift.client_requirement.client.payer.agency_id !== req.agencyId) {
    throw new Error('Shift not found or access denied.');
  }

  const worker = await prisma.worker.findFirst({
    where: { id: worker_id, agency_id: req.agencyId },
  });
  if (!worker) return res.status(404).json({ error: 'Worker not found.' });

  // Check advisory overlap
  const shiftStart = new Date(shift.scheduled_start);
  const shiftEnd = new Date(shift.scheduled_end);

  const existingConfirmed = await prisma.assignment.findMany({
    where: {
      worker_id,
      status: 'confirmed',
    },
    include: { shift: true },
  });

  const isOverlapping = existingConfirmed.some((as) => {
    const asStart = new Date(as.shift.scheduled_start);
    const asEnd = new Date(as.shift.scheduled_end);
    return shiftStart < asEnd && shiftEnd > asStart;
  });

  // Create Assignment (Confirmed decision: advisory warning, NOT a DB block)
  const assignment = await prisma.assignment.create({
    data: {
      shift_id,
      worker_id,
      status: 'confirmed',
      assigned_by: req.user!.id,
    },
  });

  // Update shift status
  await prisma.shift.update({
    where: { id: shift_id },
    data: { status: 'confirmed' },
  });

  await recordAuditLog({
    agency_id: req.agencyId!,
    actor_user_id: req.user!.id,
    entity_type: 'Assignment',
    entity_id: assignment.id,
    action: 'CREATE_ASSIGNMENT',
    after: { shift_id, worker_id, status: 'confirmed', has_overlap_warning: isOverlapping },
  });

  res.json({
    assignment,
    has_conflict_warning: isOverlapping,
    warning_message: isOverlapping
      ? `ADVISORY WARNING: ${worker.name} is already assigned to another overlapping confirmed shift!`
      : null,
  });
});

// DELETE a Shift (admin / coordinator only)
router.delete('/shifts/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;

  const shift = await prisma.shift.findFirst({
    where: {
      id,
      client_requirement: { client: { payer: { agency_id: req.agencyId } } },
    },
    include: { assignments: true },
  });

  if (!shift) {
    return res.status(404).json({ error: 'Shift not found or access denied.' });
  }

  // Cancel all assignments first (cascade would also handle this, but we log it)
  await prisma.assignment.deleteMany({ where: { shift_id: id } });

  await prisma.shift.delete({ where: { id } });

  await recordAuditLog({
    agency_id:     req.agencyId!,
    actor_user_id: req.user!.id,
    entity_type:   'Shift',
    entity_id:     id,
    action:        'DELETE_SHIFT',
    before: {
      id,
      status:           shift.status,
      scheduled_start:  shift.scheduled_start,
      scheduled_end:    shift.scheduled_end,
      assignments_count: shift.assignments.length,
    },
    after: null,
  });

  res.json({ success: true, deleted_shift_id: id });
});

// POST Create a new Shift (admin / coordinator only)
// Supports optional `recurring_weeks` (2–52) to create weekly-recurring shifts.
router.post('/shifts', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const {
    client_requirement_id,
    scheduled_start,
    scheduled_end,
    slot_number,
    worker_id,
    recurring_weeks,   // optional: number of total weeks (1 = single, 2+ = recurring)
  } = req.body;

  if (!client_requirement_id || !scheduled_start || !scheduled_end) {
    return res.status(400).json({ error: 'client_requirement_id, scheduled_start and scheduled_end are required.' });
  }

  // Verify the client requirement belongs to this agency
  const requirement = await prisma.clientRequirement.findFirst({
    where: {
      id: client_requirement_id,
      client: { payer: { agency_id: req.agencyId } },
    },
    include: { requirement_skills: true },
  });
  if (!requirement) {
    return res.status(404).json({ error: 'Client requirement not found or access denied.' });
  }

  // Optional worker pre-validation
  let workerRecord: any = null;
  if (worker_id) {
    workerRecord = await prisma.worker.findFirst({ where: { id: worker_id, agency_id: req.agencyId } });
    if (!workerRecord) return res.status(404).json({ error: 'Worker not found.' });
  }

  const weeks = Math.min(Math.max(Number(recurring_weeks) || 1, 1), 52);
  const createdShifts: any[] = [];

  for (let w = 0; w < weeks; w++) {
    const startMs = new Date(scheduled_start).getTime() + w * 7 * 24 * 60 * 60 * 1000;
    const endMs   = new Date(scheduled_end).getTime()   + w * 7 * 24 * 60 * 60 * 1000;
    const iterStart = new Date(startMs);
    const iterEnd   = new Date(endMs);

    // For week 0 use the original requirement; for future weeks find-or-create one for the new date
    let reqId = client_requirement_id;

    if (w > 0) {
      const targetDateStr = iterStart.toISOString().split('T')[0]; // UTC date string YYYY-MM-DD

      let futureReq = await prisma.clientRequirement.findFirst({
        where: {
          client_id: requirement.client_id,
          shift_date: targetDateStr,
          start_time: requirement.start_time,
          end_time:   requirement.end_time,
        },
      });

      if (!futureReq) {
        futureReq = await prisma.clientRequirement.create({
          data: {
            client_id:  requirement.client_id,
            shift_date: targetDateStr,
            start_time: requirement.start_time,
            end_time:   requirement.end_time,
            headcount:  requirement.headcount,
            status:     'approved',           // auto-approved when admin schedules recurring
          },
        });

        // Copy mandatory skills to the new requirement
        for (const rs of requirement.requirement_skills) {
          await prisma.requirementSkill.create({
            data: {
              client_requirement_id: futureReq.id,
              skill_id:      rs.skill_id,
              is_mandatory:  rs.is_mandatory,
            },
          });
        }
      }

      reqId = futureReq.id;
    }

    const slotNum = slot_number ?? ((await prisma.shift.count({ where: { client_requirement_id: reqId } })) + 1);

    const shift = await prisma.shift.create({
      data: {
        client_requirement_id: reqId,
        slot_number:    slotNum,
        scheduled_start: iterStart,
        scheduled_end:   iterEnd,
        status: 'open',
      },
    });

    let assignment = null;
    let has_conflict_warning = false;

    if (workerRecord) {
      const existing = await prisma.assignment.findMany({
        where: { worker_id, status: 'confirmed' },
        include: { shift: true },
      });
      has_conflict_warning = existing.some(a => {
        const s = new Date(a.shift.scheduled_start);
        const e = new Date(a.shift.scheduled_end);
        return iterStart < e && iterEnd > s;
      });

      assignment = await prisma.assignment.create({
        data: { shift_id: shift.id, worker_id, status: 'confirmed', assigned_by: req.user!.id },
      });
      await prisma.shift.update({ where: { id: shift.id }, data: { status: 'confirmed' } });
    }

    await recordAuditLog({
      agency_id:      req.agencyId!,
      actor_user_id:  req.user!.id,
      entity_type:    'Shift',
      entity_id:      shift.id,
      action:         'CREATE_SHIFT',
      after:          { client_requirement_id: reqId, scheduled_start: iterStart, scheduled_end: iterEnd, worker_id, week: w + 1 },
    });

    createdShifts.push({ shift, assignment, has_conflict_warning, week: w + 1 });
  }

  // Return first shift as primary response (backward compat) + full list
  const primary = createdShifts[0];
  res.status(201).json({
    shift:                primary.shift,
    assignment:           primary.assignment,
    has_conflict_warning: primary.has_conflict_warning,
    recurring_shifts:     createdShifts,
    total_weeks:          weeks,
  });
});

export default router;

