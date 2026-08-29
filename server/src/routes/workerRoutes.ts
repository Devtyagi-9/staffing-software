import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../db';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { recordAuditLog } from '../services/auditLogger';
import { uploadSingle, UPLOADS_DIR } from '../middleware/upload';

const router = Router();

/* ─── Skills ─────────────────────────────────────────────────────── */
router.get('/skills/all', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const skills = await prisma.skill.findMany();
  res.json(skills);
});

/* ─── Roles ──────────────────────────────────────────────────────── */
router.get('/roles', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const roles = await prisma.workerRole.findMany({ where: { agency_id: req.agencyId } });
  res.json(roles);
});

router.post('/roles', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const role = await prisma.workerRole.upsert({
    where: { agency_id_name: { agency_id: req.agencyId!, name } },
    update: { description },
    create: { agency_id: req.agencyId!, name, description },
  });
  res.json(role);
});

/* ─── List Workers ────────────────────────────────────────────────── */
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const workers = await prisma.worker.findMany({
    where: { agency_id: req.agencyId },
    include: {
      worker_skills: { include: { skill: true } },
      availabilities: true,
      wage_rates: { orderBy: { effective_from: 'desc' } },
      role: true,
      case_manager: { select: { id: true, email: true } },
    },
  });
  res.json(workers);
});

/* ─── Get Single Worker (full profile) ───────────────────────────── */
router.get('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const worker = await prisma.worker.findFirst({
    where: { id: req.params.id, agency_id: req.agencyId },
    include: {
      worker_skills: { include: { skill: true } },
      availabilities: true,
      wage_rates: { orderBy: { effective_from: 'desc' } },
      role: true,
      case_manager: { select: { id: true, email: true } },
      documents: { orderBy: { uploaded_at: 'desc' } },
      incidents: { orderBy: { incident_date: 'desc' } },
    },
  });
  if (!worker) return res.status(404).json({ error: 'Worker not found.' });
  res.json(worker);
});

/* ─── Create Worker ──────────────────────────────────────────────── */
router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const {
    name, preferred_name, email, phone, address,
    date_of_birth, gender, ethnicity, languages,
    next_of_kin_name, next_of_kin_phone, next_of_kin_relation,
    role_id, case_manager_id,
    worker_notes, admin_notes,
    engagement_start_date, engagement_end_date, dont_rehire, engagement_notes,
    wage_rate, skill_ids,
  } = req.body;

  const worker = await prisma.worker.create({
    data: {
      agency_id: req.agencyId!,
      name, preferred_name, email, phone,
      address,
      home_lat: 0, home_lng: 0,
      date_of_birth, gender, ethnicity,
      languages: languages ? JSON.stringify(languages) : null,
      next_of_kin_name, next_of_kin_phone, next_of_kin_relation,
      role_id: role_id || null,
      case_manager_id: case_manager_id || null,
      worker_notes, admin_notes,
      engagement_start_date, engagement_end_date,
      dont_rehire: Boolean(dont_rehire),
      engagement_notes,
      status: 'active',
    },
  });

  if (wage_rate) {
    await prisma.wageRate.create({
      data: {
        worker_id: worker.id,
        currency: 'AUD', rate_type: 'hourly',
        amount: Number(wage_rate), overtime_multiplier: 1.5,
        effective_from: new Date(),
      },
    });
  }

  if (Array.isArray(skill_ids)) {
    for (const skillId of skill_ids) {
      await prisma.workerSkill.create({ data: { worker_id: worker.id, skill_id: skillId } });
    }
  }

  await recordAuditLog({
    agency_id: req.agencyId!, actor_user_id: req.user!.id,
    entity_type: 'Worker', entity_id: worker.id,
    action: 'CREATE_WORKER', after: { name, email },
  });

  res.status(201).json(worker);
});

/* ─── Update Extended Worker Profile ────────────────────────────── */
router.put('/:id/profile', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const workerId = req.params.id;
  const worker = await prisma.worker.findFirst({ where: { id: workerId, agency_id: req.agencyId } });
  if (!worker) return res.status(404).json({ error: 'Worker not found.' });

  const {
    name, preferred_name, email, phone, address,
    date_of_birth, gender, ethnicity, languages,
    next_of_kin_name, next_of_kin_phone, next_of_kin_relation,
    role_id, case_manager_id,
    worker_notes, admin_notes,
    engagement_start_date, engagement_end_date, dont_rehire, engagement_notes,
    status,
  } = req.body;

  const updated = await prisma.worker.update({
    where: { id: workerId },
    data: {
      name, preferred_name, email, phone, address,
      date_of_birth, gender, ethnicity,
      languages: languages !== undefined ? JSON.stringify(languages) : undefined,
      next_of_kin_name, next_of_kin_phone, next_of_kin_relation,
      role_id: role_id ?? undefined,
      case_manager_id: case_manager_id ?? undefined,
      worker_notes, admin_notes,
      engagement_start_date, engagement_end_date,
      dont_rehire: dont_rehire !== undefined ? Boolean(dont_rehire) : undefined,
      engagement_notes,
      status,
    },
    include: { role: true, worker_skills: { include: { skill: true } } },
  });

  res.json(updated);
});

/* ─── Wage Rates ──────────────────────────────────────────────────── */
router.post('/:id/wage-rates', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { amount, currency, rate_type, overtime_multiplier, effective_from } = req.body;
  const workerId = req.params.id;

  const worker = await prisma.worker.findFirst({ where: { id: workerId, agency_id: req.agencyId } });
  if (!worker) return res.status(404).json({ error: 'Worker not found.' });

  const effectiveFromDate = effective_from ? new Date(effective_from) : new Date();

  const activeRate = await prisma.wageRate.findFirst({ where: { worker_id: workerId, effective_to: null } });
  if (activeRate) {
    await prisma.wageRate.update({ where: { id: activeRate.id }, data: { effective_to: effectiveFromDate } });
  }

  const newRate = await prisma.wageRate.create({
    data: {
      worker_id: workerId,
      currency: currency || 'AUD', rate_type: rate_type || 'hourly',
      amount: Number(amount), overtime_multiplier: Number(overtime_multiplier || 1.5),
      effective_from: effectiveFromDate,
    },
  });

  await recordAuditLog({
    agency_id: req.agencyId!, actor_user_id: req.user!.id,
    entity_type: 'WageRate', entity_id: newRate.id,
    action: 'CREATE_WAGE_RATE',
    before: activeRate ? { amount: activeRate.amount } : null,
    after: { amount: newRate.amount },
  });

  res.json(newRate);
});

/* ─── Availability ────────────────────────────────────────────────── */
router.post('/:id/availabilities', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const workerId = req.params.id;
  const { day_of_week, specific_date, start_time, end_time, is_available } = req.body;

  const worker = await prisma.worker.findFirst({ where: { id: workerId, agency_id: req.agencyId } });
  if (!worker) return res.status(404).json({ error: 'Worker not found.' });

  const avail = await prisma.workerAvailability.create({
    data: {
      worker_id: workerId,
      day_of_week: day_of_week !== undefined && day_of_week !== null ? Number(day_of_week) : null,
      specific_date: specific_date || null,
      start_time: start_time || '08:00',
      end_time: end_time || '17:00',
      is_available: is_available !== undefined ? Boolean(is_available) : true,
    },
  });
  res.json(avail);
});

router.delete('/:id/availabilities/:availId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const worker = await prisma.worker.findFirst({ where: { id: req.params.id, agency_id: req.agencyId } });
  if (!worker) return res.status(404).json({ error: 'Worker not found.' });
  await prisma.workerAvailability.delete({ where: { id: req.params.availId } });
  res.json({ success: true });
});

/* ─── Documents ───────────────────────────────────────────────────── */
router.get('/:id/documents', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const worker = await prisma.worker.findFirst({ where: { id: req.params.id, agency_id: req.agencyId } });
  if (!worker) return res.status(404).json({ error: 'Worker not found.' });
  const docs = await prisma.workerDocument.findMany({
    where: { worker_id: req.params.id },
    orderBy: { uploaded_at: 'desc' },
  });
  res.json(docs);
});

router.post('/:id/documents', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  uploadSingle(req as any, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const worker = await prisma.worker.findFirst({ where: { id: req.params.id, agency_id: req.agencyId } });
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });

    const { name, doc_type, expiry_date } = req.body;
    const file = (req as any).file;

    const doc = await prisma.workerDocument.create({
      data: {
        worker_id: req.params.id,
        name: name || file?.originalname || 'Unnamed Document',
        doc_type: doc_type || 'other',
        file_path: file ? path.relative(UPLOADS_DIR, file.path) : null,
        file_name: file?.filename || null,
        original_name: file?.originalname || null,
        mime_type: file?.mimetype || null,
        file_size: file?.size || null,
        expiry_date: expiry_date || null,
        uploaded_by: req.user!.id,
      },
    });

    res.status(201).json(doc);
  });
});

router.get('/:id/documents/:docId/download', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const doc = await prisma.workerDocument.findFirst({
    where: { id: req.params.docId, worker_id: req.params.id },
  });
  if (!doc || !doc.file_path) return res.status(404).json({ error: 'Document or file not found.' });

  const absPath = path.join(UPLOADS_DIR, doc.file_path);
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File not found on disk.' });

  res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name || doc.file_name}"`);
  if (doc.mime_type) res.setHeader('Content-Type', doc.mime_type);
  res.sendFile(absPath);
});

router.delete('/:id/documents/:docId', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const doc = await prisma.workerDocument.findFirst({
    where: { id: req.params.docId, worker_id: req.params.id },
    include: { worker: true },
  });
  if (!doc || doc.worker.agency_id !== req.agencyId) return res.status(404).json({ error: 'Not found.' });

  // Remove from disk
  if (doc.file_path) {
    const absPath = path.join(UPLOADS_DIR, doc.file_path);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  }

  await prisma.workerDocument.delete({ where: { id: req.params.docId } });
  res.json({ success: true });
});

/* ─── Incidents ───────────────────────────────────────────────────── */
router.get('/:id/incidents', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const worker = await prisma.worker.findFirst({ where: { id: req.params.id, agency_id: req.agencyId } });
  if (!worker) return res.status(404).json({ error: 'Worker not found.' });
  const incidents = await prisma.workerIncident.findMany({
    where: { worker_id: req.params.id },
    orderBy: { incident_date: 'desc' },
  });
  res.json(incidents);
});

router.post('/:id/incidents', authenticateJWT, (req: AuthenticatedRequest, res: Response) => {
  uploadSingle(req as any, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    const worker = await prisma.worker.findFirst({ where: { id: req.params.id, agency_id: req.agencyId } });
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });

    const { title, description, incident_date, severity } = req.body;
    if (!title || !incident_date) return res.status(400).json({ error: 'title and incident_date are required.' });

    const file = (req as any).file;
    const incident = await prisma.workerIncident.create({
      data: {
        worker_id: req.params.id,
        title, description,
        incident_date,
        severity: severity || 'low',
        file_path: file ? path.relative(UPLOADS_DIR, file.path) : null,
        file_name: file?.filename || null,
        original_name: file?.originalname || null,
        mime_type: file?.mimetype || null,
        created_by: req.user!.id,
      },
    });

    res.status(201).json(incident);
  });
});

router.get('/:id/incidents/:incId/download', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const inc = await prisma.workerIncident.findFirst({
    where: { id: req.params.incId, worker_id: req.params.id },
  });
  if (!inc || !inc.file_path) return res.status(404).json({ error: 'File not found.' });
  const absPath = path.join(UPLOADS_DIR, inc.file_path);
  if (!fs.existsSync(absPath)) return res.status(404).json({ error: 'File missing on disk.' });
  res.setHeader('Content-Disposition', `attachment; filename="${inc.original_name || inc.file_name}"`);
  if (inc.mime_type) res.setHeader('Content-Type', inc.mime_type);
  res.sendFile(absPath);
});

export default router;
