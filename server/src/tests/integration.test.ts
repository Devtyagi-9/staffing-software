import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../db';
import { approveClientRequirement } from '../services/requirementService';
import { clockInWorker, clockOutWorker, approveTimeLog } from '../services/attendanceService';
import { generateInvoiceFromTimeLogs } from '../services/billingService';
import { suggestCandidatesForShift } from '../services/matchingEngine';

describe('Staffing Platform Integration Tests', () => {
  let agencyId: string;
  let adminUserId: string;
  let clientHospitalId: string;
  let payerHealthId: string;
  let workerSarahId: string;
  let workerDavidId: string;
  let skillRNId: string;

  beforeAll(async () => {
    // Read seeded agency & user
    const agency = await prisma.agency.findFirst({ where: { name: 'Apex Staffing Solutions Australia' } });
    if (!agency) throw new Error('Seeded agency not found. Run db:seed first.');
    agencyId = agency.id;

    const admin = await prisma.user.findFirst({ where: { email: 'admin@apexstaffing.com.au' } });
    adminUserId = admin!.id;

    const client = await prisma.client.findFirst({ where: { name: { contains: 'Margaret Thompson' } } });
    clientHospitalId = client!.id;
    payerHealthId = client!.payer_id;


    const sarah = await prisma.worker.findFirst({ where: { name: 'Sarah Jenkins' } });
    workerSarahId = sarah!.id;

    const david = await prisma.worker.findFirst({ where: { name: 'David Miller' } });
    workerDavidId = david!.id;

    const skillRN = await prisma.skill.findFirst({ where: { name: { contains: 'RN' } } });
    skillRNId = skillRN!.id;
  });

  it('1. Requirement Approval & Shift Materialization Idempotency', async () => {
    // Create a new test client requirement
    const req = await prisma.clientRequirement.create({
      data: {
        client_id: clientHospitalId,
        shift_date: '2026-09-01',
        start_time: '07:00',
        end_time: '15:00',
        headcount: 3,
        status: 'pending_admin_approval',
      },
    });

    // First approval: should create 3 shifts
    const result1 = await approveClientRequirement(req.id, adminUserId, agencyId);
    expect(result1.createdNew).toBe(true);
    expect(result1.shifts.length).toBe(3);

    // Re-trigger approval: must NOT create duplicate shifts
    const result2 = await approveClientRequirement(req.id, adminUserId, agencyId);
    expect(result2.createdNew).toBe(false);
    expect(result2.shifts.length).toBe(3);

    const totalShiftsInDb = await prisma.shift.count({
      where: { client_requirement_id: req.id },
    });
    expect(totalShiftsInDb).toBe(3);
  });

  it('2. TimeLog Immutability once Billed', async () => {
    // Create requirement, shift, assignment, and approved timelog
    const req = await prisma.clientRequirement.create({
      data: {
        client_id: clientHospitalId,
        shift_date: '2026-09-02',
        start_time: '08:00',
        end_time: '16:00',
        headcount: 1,
        status: 'approved',
      },
    });
    const shift = await prisma.shift.create({
      data: {
        client_requirement_id: req.id,
        slot_number: 1,
        scheduled_start: new Date('2026-09-02T08:00:00Z'),
        scheduled_end: new Date('2026-09-02T16:00:00Z'),
        status: 'confirmed',
      },
    });
    const assignment = await prisma.assignment.create({
      data: {
        shift_id: shift.id,
        worker_id: workerSarahId,
        status: 'confirmed',
      },
    });

    const clockInRes = await clockInWorker({
      assignment_id: assignment.id,
      clock_in_lat: -33.8791,
      clock_in_lng: 151.2205,
      agency_id: agencyId,
    });

    const timeLogId = clockInRes.timeLog.id;
    await approveTimeLog(timeLogId, adminUserId, agencyId);

    // Generate Invoice to mark time log as billed
    const invoice = await generateInvoiceFromTimeLogs({
      agency_id: agencyId,
      payer_id: payerHealthId,
      billing_period_start: '2026-08-01',
      billing_period_end: '2026-09-30',
      actor_user_id: adminUserId,
    });

    expect(invoice).toBeDefined();

    // Verify time log is now billed
    const billedLog = await prisma.timeLog.findUnique({ where: { id: timeLogId } });
    expect(billedLog?.billed_at).not.toBeNull();
    expect(billedLog?.status).toBe('billed');

    // Attempting to clock out after billed MUST throw IMMUTABLE_RECORD error
    await expect(
      clockOutWorker({
        time_log_id: timeLogId,
        clock_out_lat: -33.8791,
        clock_out_lng: 151.2205,
        agency_id: agencyId,
      })
    ).rejects.toThrow(/IMMUTABLE_RECORD/);
  });

  it('3. Two-Phase Candidate Matching Engine Hard Filters', async () => {
    // Create shift requiring RN skill
    const req = await prisma.clientRequirement.create({
      data: {
        client_id: clientHospitalId,
        shift_date: '2026-09-10',
        start_time: '07:00',
        end_time: '15:00',
        headcount: 1,
        status: 'approved',
      },
    });
    await prisma.requirementSkill.create({
      data: {
        client_requirement_id: req.id,
        skill_id: skillRNId,
        is_mandatory: true,
      },
    });
    const shift = await prisma.shift.create({
      data: {
        client_requirement_id: req.id,
        slot_number: 1,
        scheduled_start: new Date('2026-09-10T07:00:00Z'),
        scheduled_end: new Date('2026-09-10T15:00:00Z'),
        status: 'open',
      },
    });

    const suggestions = await suggestCandidatesForShift(shift.id, agencyId);
    expect(suggestions.length).toBeGreaterThan(0);

    // Sarah Jenkins (has RN skill) should pass Phase 1
    const sarahRes = suggestions.find((c) => c.worker_id === workerSarahId);
    expect(sarahRes?.passed_phase1).toBe(true);

    // David Miller (EN Nurse, missing RN skill) should fail Phase 1 mandatory skill check
    const davidRes = suggestions.find((c) => c.worker_id === workerDavidId);
    expect(davidRes?.passed_phase1).toBe(false);
    expect(davidRes?.phase1_failures[0]).toContain('Missing required mandatory skills');
  });
});
