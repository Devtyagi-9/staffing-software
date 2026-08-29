import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { recordAuditLog } from '../services/auditLogger';

const router = Router();

/* ─── Funding Types ───────────────────────────────────────────── */
router.get('/funding-types', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const types = await prisma.fundingType.findMany({
    where: { agency_id: req.agencyId },
    orderBy: { name: 'asc' },
  });
  res.json(types);
});

router.post('/funding-types', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });

  const ft = await prisma.fundingType.upsert({
    where: { agency_id_name: { agency_id: req.agencyId!, name } },
    update: {},
    create: { agency_id: req.agencyId!, name },
  });
  res.status(201).json(ft);
});

router.delete('/funding-types/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const ft = await prisma.fundingType.findFirst({
    where: { id: req.params.id, agency_id: req.agencyId },
  });
  if (!ft) return res.status(404).json({ error: 'Funding type not found.' });
  await prisma.fundingType.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

/* ─── Clients ─────────────────────────────────────────────────── */

// GET all clients
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const clients = await prisma.client.findMany({
    where: { payer: { agency_id: req.agencyId } },
    include: {
      payer: { select: { id: true, name: true } },
      funding_type: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(clients);
});

// GET single client
router.get('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const client = await prisma.client.findFirst({
    where: { id: req.params.id, payer: { agency_id: req.agencyId } },
    include: {
      payer: { select: { id: true, name: true } },
      funding_type: { select: { id: true, name: true } },
    },
  });
  if (!client) return res.status(404).json({ error: 'Client not found.' });
  res.json(client);
});

// POST create client
router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const {
    payer_id, name, preferred_name, address_line, lat, lng, timezone,
    phone, gender, date_of_birth,
    next_of_kin_name, next_of_kin_phone, next_of_kin_relation,
    funding_type_id, notes,
  } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required.' });

  // Validate payer belongs to agency
  const payer = await prisma.payer.findFirst({
    where: { id: payer_id, agency_id: req.agencyId },
  });
  if (!payer) return res.status(400).json({ error: 'Invalid payer for this agency.' });

  const client = await prisma.client.create({
    data: {
      payer_id,
      name,
      preferred_name: preferred_name || null,
      address_line: address_line || '',
      lat: lat ? Number(lat) : 0,
      lng: lng ? Number(lng) : 0,
      timezone: timezone || 'Australia/Sydney',
      phone: phone || null,
      gender: gender || null,
      date_of_birth: date_of_birth || null,
      next_of_kin_name: next_of_kin_name || null,
      next_of_kin_phone: next_of_kin_phone || null,
      next_of_kin_relation: next_of_kin_relation || null,
      funding_type_id: funding_type_id || null,
      notes: notes || null,
    },
    include: {
      payer: { select: { id: true, name: true } },
      funding_type: { select: { id: true, name: true } },
    },
  });

  await recordAuditLog({
    agency_id: req.agencyId!, actor_user_id: req.user!.id,
    entity_type: 'Client', entity_id: client.id,
    action: 'CREATE_CLIENT', after: { name, payer_id },
  });

  res.status(201).json(client);
});

// PUT update client
router.put('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.client.findFirst({
    where: { id: req.params.id, payer: { agency_id: req.agencyId } },
  });
  if (!existing) return res.status(404).json({ error: 'Client not found.' });

  const {
    payer_id, name, preferred_name, address_line, lat, lng, timezone,
    phone, gender, date_of_birth,
    next_of_kin_name, next_of_kin_phone, next_of_kin_relation,
    funding_type_id, notes,
  } = req.body;

  // If payer is being changed, validate it
  if (payer_id && payer_id !== existing.payer_id) {
    const payer = await prisma.payer.findFirst({
      where: { id: payer_id, agency_id: req.agencyId },
    });
    if (!payer) return res.status(400).json({ error: 'Invalid payer for this agency.' });
  }

  const updated = await prisma.client.update({
    where: { id: req.params.id },
    data: {
      payer_id: payer_id ?? existing.payer_id,
      name: name ?? existing.name,
      preferred_name: preferred_name !== undefined ? (preferred_name || null) : existing.preferred_name,
      address_line: address_line ?? existing.address_line,
      lat: lat !== undefined ? Number(lat) : existing.lat,
      lng: lng !== undefined ? Number(lng) : existing.lng,
      timezone: timezone ?? existing.timezone,
      phone: phone !== undefined ? (phone || null) : existing.phone,
      gender: gender !== undefined ? (gender || null) : existing.gender,
      date_of_birth: date_of_birth !== undefined ? (date_of_birth || null) : existing.date_of_birth,
      next_of_kin_name: next_of_kin_name !== undefined ? (next_of_kin_name || null) : existing.next_of_kin_name,
      next_of_kin_phone: next_of_kin_phone !== undefined ? (next_of_kin_phone || null) : existing.next_of_kin_phone,
      next_of_kin_relation: next_of_kin_relation !== undefined ? (next_of_kin_relation || null) : existing.next_of_kin_relation,
      funding_type_id: funding_type_id !== undefined ? (funding_type_id || null) : existing.funding_type_id,
      notes: notes !== undefined ? (notes || null) : existing.notes,
    },
    include: {
      payer: { select: { id: true, name: true } },
      funding_type: { select: { id: true, name: true } },
    },
  });

  await recordAuditLog({
    agency_id: req.agencyId!, actor_user_id: req.user!.id,
    entity_type: 'Client', entity_id: updated.id,
    action: 'UPDATE_CLIENT',
    before: { name: existing.name },
    after: { name: updated.name },
  });

  res.json(updated);
});

// DELETE client
router.delete('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.client.findFirst({
    where: { id: req.params.id, payer: { agency_id: req.agencyId } },
  });
  if (!existing) return res.status(404).json({ error: 'Client not found.' });

  await prisma.client.delete({ where: { id: req.params.id } });

  await recordAuditLog({
    agency_id: req.agencyId!, actor_user_id: req.user!.id,
    entity_type: 'Client', entity_id: req.params.id,
    action: 'DELETE_CLIENT', before: { name: existing.name },
  });

  res.json({ success: true });
});

export default router;
