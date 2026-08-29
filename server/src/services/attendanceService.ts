import { prisma } from '../db';
import haversine from 'haversine-distance';
import { recordAuditLog } from './auditLogger';

export async function clockInWorker(params: {
  assignment_id: string;
  clock_in_lat: number;
  clock_in_lng: number;
  agency_id: string;
}) {
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignment_id },
    include: {
      shift: {
        include: {
          client_requirement: {
            include: { client: { include: { payer: true } } },
          },
        },
      },
    },
  });

  if (!assignment || assignment.shift.client_requirement.client.payer.agency_id !== params.agency_id) {
    throw new Error('Assignment not found or unauthorized.');
  }

  const client = assignment.shift.client_requirement.client;

  // Get geofence radius config
  const laborConfig = await prisma.laborConfig.findUnique({
    where: { agency_id: params.agency_id },
  });
  const maxRadiusMeters = laborConfig?.geofence_radius_meters || 150.0;

  const distanceMeters = haversine(
    { latitude: params.clock_in_lat, longitude: params.clock_in_lng },
    { latitude: client.lat, longitude: client.lng }
  );

  const geofencePassed = distanceMeters <= maxRadiusMeters;

  const timeLog = await prisma.timeLog.create({
    data: {
      assignment_id: params.assignment_id,
      clock_in_at: new Date(),
      clock_in_lat: params.clock_in_lat,
      clock_in_lng: params.clock_in_lng,
      geofence_passed: geofencePassed,
      status: 'pending_approval',
    },
  });

  // Update assignment status
  await prisma.assignment.update({
    where: { id: params.assignment_id },
    data: { status: 'checked_in' },
  });

  return { timeLog, distanceMeters: Math.round(distanceMeters), geofencePassed };
}

export async function clockOutWorker(params: {
  time_log_id: string;
  clock_out_lat: number;
  clock_out_lng: number;
  agency_id: string;
}) {
  const timeLog = await prisma.timeLog.findUnique({
    where: { id: params.time_log_id },
    include: {
      assignment: {
        include: {
          shift: {
            include: {
              client_requirement: {
                include: { client: { include: { payer: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!timeLog || timeLog.assignment.shift.client_requirement.client.payer.agency_id !== params.agency_id) {
    throw new Error('Time log not found or unauthorized.');
  }

  // Immutability Guard: Check if already billed
  if (timeLog.billed_at) {
    throw new Error('IMMUTABLE_RECORD: Cannot modify time log that has already been billed. Use TimeLogAdjustment instead.');
  }

  const client = timeLog.assignment.shift.client_requirement.client;
  const laborConfig = await prisma.laborConfig.findUnique({
    where: { agency_id: params.agency_id },
  });
  const maxRadiusMeters = laborConfig?.geofence_radius_meters || 150.0;

  const distanceMeters = haversine(
    { latitude: params.clock_out_lat, longitude: params.clock_out_lng },
    { latitude: client.lat, longitude: client.lng }
  );

  const geofencePassed = timeLog.geofence_passed && distanceMeters <= maxRadiusMeters;

  const updatedTimeLog = await prisma.timeLog.update({
    where: { id: params.time_log_id },
    data: {
      clock_out_at: new Date(),
      clock_out_lat: params.clock_out_lat,
      clock_out_lng: params.clock_out_lng,
      geofence_passed: geofencePassed,
    },
  });

  await prisma.assignment.update({
    where: { id: timeLog.assignment_id },
    data: { status: 'completed' },
  });

  return { timeLog: updatedTimeLog, distanceMeters: Math.round(distanceMeters), geofencePassed };
}

export async function approveTimeLog(timeLogId: string, approverUserId: string, agencyId: string) {
  const timeLog = await prisma.timeLog.findUnique({
    where: { id: timeLogId },
    include: {
      assignment: {
        include: {
          shift: {
            include: {
              client_requirement: {
                include: { client: { include: { payer: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!timeLog || timeLog.assignment.shift.client_requirement.client.payer.agency_id !== agencyId) {
    throw new Error('Time log not found or unauthorized.');
  }

  if (timeLog.billed_at) {
    throw new Error('IMMUTABLE_RECORD: Cannot alter status of already billed time log.');
  }

  const updated = await prisma.timeLog.update({
    where: { id: timeLogId },
    data: {
      status: 'approved',
      approved_by: approverUserId,
      approved_at: new Date(),
    },
  });

  await recordAuditLog({
    agency_id: agencyId,
    actor_user_id: approverUserId,
    entity_type: 'TimeLog',
    entity_id: timeLogId,
    action: 'APPROVE_TIMELOG',
    before: { status: timeLog.status },
    after: { status: 'approved' },
  });

  return updated;
}

export async function addTimeLogAdjustment(params: {
  time_log_id: string;
  reason: string;
  original_hours: number;
  corrected_hours: number;
  created_by: string;
  agency_id: string;
}) {
  const timeLog = await prisma.timeLog.findUnique({
    where: { id: params.time_log_id },
    include: {
      assignment: {
        include: {
          shift: {
            include: {
              client_requirement: {
                include: { client: { include: { payer: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!timeLog || timeLog.assignment.shift.client_requirement.client.payer.agency_id !== params.agency_id) {
    throw new Error('Time log not found or unauthorized.');
  }

  const adjustment = await prisma.timeLogAdjustment.create({
    data: {
      time_log_id: params.time_log_id,
      reason: params.reason,
      original_hours: params.original_hours,
      corrected_hours: params.corrected_hours,
      created_by: params.created_by,
    },
  });

  await recordAuditLog({
    agency_id: params.agency_id,
    actor_user_id: params.created_by,
    entity_type: 'TimeLog',
    entity_id: params.time_log_id,
    action: 'TIMELOG_ADJUSTMENT_CREATED',
    after: { adjustment_id: adjustment.id, original_hours: params.original_hours, corrected_hours: params.corrected_hours },
  });

  return adjustment;
}
