import { prisma } from '../db';

export async function recordAuditLog(params: {
  agency_id: string;
  actor_user_id?: string | null;
  entity_type: 'Assignment' | 'WageRate' | 'BillRate' | 'Invoice' | 'ClientRequirement' | 'TimeLog' | 'Worker' | 'Shift' | 'WorkerDocument' | 'WorkerIncident' | 'WorkerRole' | 'Payer' | 'Client';

  entity_id: string;
  action: string;
  before?: any;
  after?: any;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        agency_id: params.agency_id,
        actor_user_id: params.actor_user_id || null,
        entity_type: params.entity_type,
        entity_id: params.entity_id,
        action: params.action,
        before_json: params.before ? JSON.stringify(params.before) : null,
        after_json: params.after ? JSON.stringify(params.after) : null,
      },
    });
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}
