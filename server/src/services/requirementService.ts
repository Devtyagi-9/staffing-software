import { prisma } from '../db';
import { recordAuditLog } from './auditLogger';

export async function approveClientRequirement(requirementId: string, adminUserId: string, agencyId: string) {
  const req = await prisma.clientRequirement.findUnique({
    where: { id: requirementId },
    include: {
      client: {
        include: { payer: true },
      },
      shifts: true,
    },
  });

  if (!req) {
    throw new Error('Client requirement not found.');
  }

  if (req.client.payer.agency_id !== agencyId) {
    throw new Error('Unauthorized agency access.');
  }

  // Idempotency check: if shifts are already generated, do not duplicate
  if (req.shifts.length > 0) {
    // Already has shifts generated! Ensure status is updated but don't re-create shifts
    const updated = await prisma.clientRequirement.update({
      where: { id: requirementId },
      data: {
        status: 'shifts_generated',
        approved_by: adminUserId,
        approved_at: req.approved_at || new Date(),
      },
    });

    await recordAuditLog({
      agency_id: agencyId,
      actor_user_id: adminUserId,
      entity_type: 'ClientRequirement',
      entity_id: requirementId,
      action: 'RE_APPROVE_IDEMPOTENT',
      before: { status: req.status },
      after: { status: 'shifts_generated' },
    });

    return { requirement: updated, shifts: req.shifts, createdNew: false };
  }

  // Generate exact headcount shifts
  const shiftDateStr = req.shift_date; // YYYY-MM-DD
  const scheduledStart = new Date(`${shiftDateStr}T${req.start_time}:00.000Z`);
  const scheduledEnd = new Date(`${shiftDateStr}T${req.end_time}:00.000Z`);

  // Handle shift wrapping past midnight (e.g. 22:00 to 06:00)
  if (scheduledEnd <= scheduledStart) {
    scheduledEnd.setDate(scheduledEnd.getDate() + 1);
  }

  const shiftsToCreate: any[] = [];
  for (let slot = 1; slot <= req.headcount; slot++) {
    shiftsToCreate.push({
      client_requirement_id: req.id,
      slot_number: slot,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      status: 'open',
    });
  }

  const createdShifts = await prisma.$transaction(async (tx) => {
    await tx.shift.createMany({ data: shiftsToCreate });
    const shifts = await tx.shift.findMany({
      where: { client_requirement_id: req.id },
    });

    const updated = await tx.clientRequirement.update({
      where: { id: requirementId },
      data: {
        status: 'shifts_generated',
        approved_by: adminUserId,
        approved_at: new Date(),
      },
    });

    return shifts;
  });

  await recordAuditLog({
    agency_id: agencyId,
    actor_user_id: adminUserId,
    entity_type: 'ClientRequirement',
    entity_id: requirementId,
    action: 'APPROVE_GENERATE_SHIFTS',
    before: { status: req.status, shiftsCount: 0 },
    after: { status: 'shifts_generated', shiftsCount: createdShifts.length },
  });

  const updatedReq = await prisma.clientRequirement.findUnique({
    where: { id: requirementId },
  });

  return { requirement: updatedReq, shifts: createdShifts, createdNew: true };
}

export async function rejectClientRequirement(requirementId: string, adminUserId: string, agencyId: string) {
  const req = await prisma.clientRequirement.findUnique({
    where: { id: requirementId },
    include: { client: { include: { payer: true } } },
  });

  if (!req || req.client.payer.agency_id !== agencyId) {
    throw new Error('Requirement not found or access denied.');
  }

  const updated = await prisma.clientRequirement.update({
    where: { id: requirementId },
    data: { status: 'rejected' },
  });

  await recordAuditLog({
    agency_id: agencyId,
    actor_user_id: adminUserId,
    entity_type: 'ClientRequirement',
    entity_id: requirementId,
    action: 'REJECT',
    before: { status: req.status },
    after: { status: 'rejected' },
  });

  return updated;
}
