import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticateJWT, AuthenticatedRequest, requireRole } from '../middleware/auth';
import {
  generateInvoicesPerClient,
  generateInvoicePDFBuffer,
  previewBillableByClient,
} from '../services/billingService';
import { recordAuditLog } from '../services/auditLogger';

const router = Router();

/* ─── Bill Rates ──────────────────────────────────────────────── */

router.get('/bill-rates', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const rates = await prisma.billRate.findMany({
    where: { payer: { agency_id: req.agencyId } },
    include: { payer: true, client: true, skill: true },
    orderBy: { effective_from: 'desc' },
  });
  res.json(rates);
});

router.post('/bill-rates', authenticateJWT, requireRole(['admin', 'coordinator']), async (req: AuthenticatedRequest, res: Response) => {
  const { payer_id, client_id, skill_id, amount, currency, rate_type, effective_from } = req.body;

  const payer = await prisma.payer.findFirst({ where: { id: payer_id, agency_id: req.agencyId } });
  if (!payer) return res.status(400).json({ error: 'Payer not found or access denied.' });

  const effectiveFromDate = effective_from ? new Date(effective_from) : new Date();

  const activeRate = await prisma.billRate.findFirst({
    where: { payer_id, client_id: client_id || null, skill_id: skill_id || null, effective_to: null },
  });
  if (activeRate) {
    await prisma.billRate.update({ where: { id: activeRate.id }, data: { effective_to: effectiveFromDate } });
  }

  const newRate = await prisma.billRate.create({
    data: {
      payer_id,
      client_id: client_id || null,
      skill_id: skill_id || null,
      currency: currency || 'AUD',
      rate_type: rate_type || 'hourly',
      amount: Number(amount),
      effective_from: effectiveFromDate,
    },
  });

  await recordAuditLog({
    agency_id: req.agencyId!, actor_user_id: req.user!.id,
    entity_type: 'BillRate', entity_id: newRate.id,
    action: 'CREATE_BILL_RATE',
    before: activeRate ? { id: activeRate.id, amount: activeRate.amount } : null,
    after: { id: newRate.id, amount: newRate.amount },
  });

  res.json(newRate);
});

/* ─── Preview (no side effects) ──────────────────────────────── */

// GET /billing/invoices/preview?payer_id=&start=&end=
router.get('/invoices/preview', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { payer_id, billing_period_start, billing_period_end } = req.query as Record<string, string>;

  if (!payer_id || !billing_period_start || !billing_period_end) {
    return res.status(400).json({ error: 'payer_id, billing_period_start, billing_period_end are required.' });
  }

  const payer = await prisma.payer.findFirst({ where: { id: payer_id, agency_id: req.agencyId } });
  if (!payer) return res.status(404).json({ error: 'Payer not found.' });

  try {
    const preview = await previewBillableByClient({
      agency_id: req.agencyId!,
      payer_id,
      billing_period_start,
      billing_period_end,
    });
    res.json({ payer, preview });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ─── Invoices ────────────────────────────────────────────────── */

router.get('/invoices', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { payer_id } = req.query as Record<string, string>;
  const where: any = { agency_id: req.agencyId };
  if (payer_id) where.payer_id = payer_id;

  const invoices = await prisma.invoice.findMany({
    where,
    include: {
      payer: true,
      line_items: {
        include: {
          worker: true,
          client: true,
          time_log: {
            include: {
              assignment: {
                include: {
                  shift: {
                    include: { client_requirement: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { shift_date: 'asc' },
      },
      payments: true,
    },
    orderBy: { issued_at: 'desc' },
  });
  res.json(invoices);
});

// POST generate — creates one invoice per client for the selected payer + period
router.post('/invoices/generate', authenticateJWT, requireRole(['admin', 'coordinator']), async (req: AuthenticatedRequest, res: Response) => {
  const { payer_id, billing_period_start, billing_period_end, currency, client_ids } = req.body;
  try {
    const invoices = await generateInvoicesPerClient({
      agency_id: req.agencyId!,
      payer_id,
      billing_period_start,
      billing_period_end,
      actor_user_id: req.user!.id,
      currency,
      client_ids, // optional filter
    });
    res.json({ invoices, count: invoices.length });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update invoice status (sent, void)
router.put('/invoices/:id/status', authenticateJWT, requireRole(['admin', 'coordinator']), async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  const ALLOWED = ['draft', 'sent', 'overdue', 'void'];
  if (!ALLOWED.includes(status)) return res.status(400).json({ error: `status must be one of: ${ALLOWED.join(', ')}` });

  const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, agency_id: req.agencyId } });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  const updated = await prisma.invoice.update({ where: { id: req.params.id }, data: { status } });
  res.json(updated);
});

// DELETE void/delete a draft invoice
router.delete('/invoices/:id', authenticateJWT, requireRole(['admin', 'coordinator']), async (req: AuthenticatedRequest, res: Response) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, agency_id: req.agencyId },
    include: { line_items: true },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (invoice.status !== 'draft') return res.status(409).json({ error: 'Only draft invoices can be deleted. Void sent invoices instead.' });

  // Un-bill the time logs so they can be re-billed
  const timeLogIds = invoice.line_items.map(li => li.time_log_id);
  if (timeLogIds.length > 0) {
    await prisma.timeLog.updateMany({
      where: { id: { in: timeLogIds } },
      data: { status: 'approved', billed_at: null },
    });
  }

  await prisma.invoice.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

// GET PDF download
router.get('/invoices/:id/pdf', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const invoice = await prisma.invoice.findFirst({
    where: { id: req.params.id, agency_id: req.agencyId },
    include: {
      payer: true,
      agency: true,
      line_items: {
        include: {
          worker: true,
          client: true,
          time_log: {
            include: {
              assignment: {
                include: {
                  shift: {
                    include: { client_requirement: true },
                  },
                },
              },
            },
          },
        },
        orderBy: { shift_date: 'asc' },
      },
    },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  try {
    const pdfBuffer = await generateInvoicePDFBuffer(invoice);
    const clientName = invoice.line_items[0]?.client?.name?.replace(/[^a-z0-9]/gi, '_') || 'invoice';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="INV-${invoice.id.substring(0, 8).toUpperCase()}_${clientName}.pdf"`);
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
  }
});

// POST record payment
router.post('/invoices/:id/payments', authenticateJWT, requireRole(['admin', 'coordinator']), async (req: AuthenticatedRequest, res: Response) => {
  const { amount, method, reference_number } = req.body;
  const invoiceId = req.params.id;

  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, agency_id: req.agencyId },
    include: { payments: true },
  });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  const payment = await prisma.payment.create({
    data: {
      invoice_id: invoiceId,
      amount: Number(amount),
      currency: invoice.currency,
      method: method || 'bank_transfer',
      reference_number: reference_number || `REF-${Date.now()}`,
    },
  });

  const totalPaid = invoice.payments.reduce((acc, p) => acc + p.amount, 0) + Number(amount);
  const newStatus = totalPaid >= invoice.total ? 'paid' : 'partially_paid';

  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: newStatus } });

  res.json({ payment, new_status: newStatus, total_paid: totalPaid });
});

export default router;
