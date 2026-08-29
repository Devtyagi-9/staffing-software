import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';
import { recordAuditLog } from '../services/auditLogger';

const router = Router();

// GET all payers (with client count)
router.get('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const payers = await prisma.payer.findMany({
    where: { agency_id: req.agencyId },
    include: {
      clients: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(payers);
});

// GET single payer
router.get('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const payer = await prisma.payer.findFirst({
    where: { id: req.params.id, agency_id: req.agencyId },
    include: { clients: true },
  });
  if (!payer) return res.status(404).json({ error: 'Payer not found.' });
  res.json(payer);
});

// POST create payer
router.post('/', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const {
    name, contract_terms, payment_terms_days,
    billing_email, billing_phone, billing_address, abn,
  } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required.' });

  const payer = await prisma.payer.create({
    data: {
      agency_id: req.agencyId!,
      name,
      contract_terms: typeof contract_terms === 'string' ? contract_terms : JSON.stringify(contract_terms || {}),
      payment_terms_days: Number(payment_terms_days || 30),
      billing_email: billing_email || null,
      billing_phone: billing_phone || null,
      billing_address: billing_address || null,
      abn: abn || null,
    },
  });

  await recordAuditLog({
    agency_id: req.agencyId!, actor_user_id: req.user!.id,
    entity_type: 'Payer', entity_id: payer.id,
    action: 'CREATE_PAYER', after: { name },
  });

  res.status(201).json(payer);
});

// PUT update payer
router.put('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.payer.findFirst({
    where: { id: req.params.id, agency_id: req.agencyId },
  });
  if (!existing) return res.status(404).json({ error: 'Payer not found.' });

  const {
    name, contract_terms, payment_terms_days,
    billing_email, billing_phone, billing_address, abn,
  } = req.body;

  const updated = await prisma.payer.update({
    where: { id: req.params.id },
    data: {
      name: name ?? existing.name,
      contract_terms: contract_terms !== undefined
        ? (typeof contract_terms === 'string' ? contract_terms : JSON.stringify(contract_terms))
        : existing.contract_terms,
      payment_terms_days: payment_terms_days !== undefined ? Number(payment_terms_days) : existing.payment_terms_days,
      billing_email: billing_email !== undefined ? billing_email : existing.billing_email,
      billing_phone: billing_phone !== undefined ? billing_phone : existing.billing_phone,
      billing_address: billing_address !== undefined ? billing_address : existing.billing_address,
      abn: abn !== undefined ? abn : existing.abn,
    },
    include: { clients: { select: { id: true, name: true } } },
  });

  await recordAuditLog({
    agency_id: req.agencyId!, actor_user_id: req.user!.id,
    entity_type: 'Payer', entity_id: updated.id,
    action: 'UPDATE_PAYER',
    before: { name: existing.name },
    after: { name: updated.name },
  });

  res.json(updated);
});

// DELETE payer
router.delete('/:id', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const existing = await prisma.payer.findFirst({
    where: { id: req.params.id, agency_id: req.agencyId },
    include: { clients: { select: { id: true } } },
  });
  if (!existing) return res.status(404).json({ error: 'Payer not found.' });
  if (existing.clients.length > 0) {
    return res.status(409).json({ error: `Cannot delete payer with ${existing.clients.length} linked client(s). Remove or reassign clients first.` });
  }

  await prisma.payer.delete({ where: { id: req.params.id } });

  await recordAuditLog({
    agency_id: req.agencyId!, actor_user_id: req.user!.id,
    entity_type: 'Payer', entity_id: req.params.id,
    action: 'DELETE_PAYER', before: { name: existing.name },
  });

  res.json({ success: true });
});

export default router;
