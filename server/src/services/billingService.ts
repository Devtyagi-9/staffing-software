import { prisma } from '../db';
import PDFDocument from 'pdfkit';
import { recordAuditLog } from './auditLogger';

/* ─────────────────────────────────────────────────────────────────
   BILL RATE RESOLUTION
   Hierarchy: (payer+client+skill) → (payer+client) → (payer+skill) → payer default
   ───────────────────────────────────────────────────────────────── */
export async function resolveBillRate(params: {
  payer_id: string;
  client_id: string;
  skill_id?: string | null;
  shift_date: Date;
}): Promise<number> {
  const shiftDate = params.shift_date;

  const rates = await prisma.billRate.findMany({
    where: {
      payer_id: params.payer_id,
      effective_from: { lte: shiftDate },
      OR: [{ effective_to: null }, { effective_to: { gte: shiftDate } }],
    },
    orderBy: { effective_from: 'desc' },
  });

  if (rates.length === 0) return 65.0; // default fallback

  if (params.skill_id) {
    const exact = rates.find(r => r.client_id === params.client_id && r.skill_id === params.skill_id);
    if (exact) return exact.amount;
  }

  const clientMatch = rates.find(r => r.client_id === params.client_id);
  if (clientMatch) return clientMatch.amount;

  if (params.skill_id) {
    const skillMatch = rates.find(r => r.skill_id === params.skill_id);
    if (skillMatch) return skillMatch.amount;
  }

  return rates[0].amount;
}

/* ─────────────────────────────────────────────────────────────────
   PREVIEW: return unbilled work grouped by client — NO side effects
   ───────────────────────────────────────────────────────────────── */
export async function previewBillableByClient(params: {
  agency_id: string;
  payer_id: string;
  billing_period_start: string;
  billing_period_end: string;
}) {
  const startDate = new Date(`${params.billing_period_start}T00:00:00.000Z`);
  const endDate   = new Date(`${params.billing_period_end}T23:59:59.999Z`);

  const unbilledLogs = await prisma.timeLog.findMany({
    where: {
      status: 'approved',
      billed_at: null,
      clock_in_at: { gte: startDate, lte: endDate },
      assignment: {
        shift: {
          client_requirement: {
            client: {
              payer_id: params.payer_id,
              payer: { agency_id: params.agency_id },
            },
          },
        },
      },
    },
    include: {
      adjustments: { orderBy: { created_at: 'desc' }, take: 1 },
      assignment: {
        include: {
          worker: {
            include: {
              wage_rates: { orderBy: { effective_from: 'desc' }, take: 1 }
            }
          },
          shift: {
            include: {
              client_requirement: {
                include: {
                  client: true,
                  requirement_skills: true,
                },
              },
            },
          },
        },
      },
    },
  });

  // Group by client
  const clientMap = new Map<string, {
    client: any;
    logs: any[];
    estimated_hours: number;
    estimated_total: number;
    worker_names: Set<string>;
  }>();

  for (const log of unbilledLogs) {
    const client = log.assignment.shift.client_requirement.client;
    const worker = log.assignment.worker;

    if (!clientMap.has(client.id)) {
      clientMap.set(client.id, {
        client,
        logs: [],
        estimated_hours: 0,
        estimated_total: 0,
        worker_names: new Set(),
      });
    }

    const entry = clientMap.get(client.id)!;
    const clockIn  = new Date(log.clock_in_at);
    
    let hours = 0;
    if (log.adjustments && log.adjustments.length > 0) {
      hours = log.adjustments[0].corrected_hours;
    } else {
      const clockOut = log.clock_out_at
        ? new Date(log.clock_out_at)
        : new Date(log.assignment.shift.scheduled_end);
      hours = Math.max(0.5, (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60));
    }

    // Use worker's wage rate instead of Bill Rate Hierarchy
    const rate = worker.wage_rates && worker.wage_rates.length > 0 ? worker.wage_rates[0].amount : 45.0; // Fallback to 45 if no wage rate is set

    entry.logs.push(log);
    entry.estimated_hours   += hours;
    entry.estimated_total   += hours * rate;
    entry.worker_names.add(worker.name);
  }

  return Array.from(clientMap.values()).map(entry => ({
    client_id:       entry.client.id,
    client_name:     entry.client.name,
    shift_count:     entry.logs.length,
    estimated_hours: Math.round(entry.estimated_hours * 100) / 100,
    estimated_total: Math.round(entry.estimated_total * 100) / 100,
    workers:         Array.from(entry.worker_names),
  }));
}

/* ─────────────────────────────────────────────────────────────────
   GENERATE: one invoice PER CLIENT for a payer + date range
   ───────────────────────────────────────────────────────────────── */
export async function generateInvoicesPerClient(params: {
  agency_id: string;
  payer_id: string;
  billing_period_start: string;
  billing_period_end: string;
  actor_user_id: string;
  currency?: string;
  client_ids?: string[]; // optional: limit to specific clients
}) {
  const startDate = new Date(`${params.billing_period_start}T00:00:00.000Z`);
  const endDate   = new Date(`${params.billing_period_end}T23:59:59.999Z`);

  const clientFilter: any = {
    payer_id: params.payer_id,
    payer: { agency_id: params.agency_id },
  };
  if (params.client_ids && params.client_ids.length > 0) {
    clientFilter.id = { in: params.client_ids };
  }

  const unbilledLogs = await prisma.timeLog.findMany({
    where: {
      status: 'approved',
      billed_at: null,
      clock_in_at: { gte: startDate, lte: endDate },
      assignment: {
        shift: {
          client_requirement: { client: clientFilter },
        },
      },
    },
    include: {
      adjustments: { orderBy: { created_at: 'desc' }, take: 1 },
      assignment: {
        include: {
          worker: {
            include: {
              wage_rates: { orderBy: { effective_from: 'desc' }, take: 1 }
            }
          },
          shift: {
            include: {
              client_requirement: {
                include: {
                  client: true,
                  requirement_skills: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (unbilledLogs.length === 0) {
    throw new Error('NO_UNBILLED_LOGS: No unbilled approved time logs found for the selected period and payer.');
  }

  const payer  = await prisma.payer.findUnique({ where: { id: params.payer_id } });
  if (!payer) throw new Error('Payer not found');

  const agency   = await prisma.agency.findUnique({ where: { id: params.agency_id } });
  const currency = params.currency || agency?.default_currency || 'AUD';

  const dueDays  = payer.payment_terms_days || 30;
  const issuedAt = new Date();
  const dueAt    = new Date(issuedAt.getTime() + dueDays * 24 * 60 * 60 * 1000);

  // Group time logs by client_id
  const byClient = new Map<string, { client: any; logs: any[] }>();
  for (const log of unbilledLogs) {
    const client = log.assignment.shift.client_requirement.client;
    if (!byClient.has(client.id)) byClient.set(client.id, { client, logs: [] });
    byClient.get(client.id)!.logs.push(log);
  }

  const createdInvoices: any[] = [];

  for (const { client, logs } of byClient.values()) {
    let subtotal = 0;
    const lineItemsData: any[] = [];

    for (const log of logs) {
      const shift  = log.assignment.shift;
      const worker = log.assignment.worker;
      const shiftDateStr = shift.client_requirement.shift_date;

      const clockIn  = new Date(log.clock_in_at);
      let rawHours = 0;
      if (log.adjustments && log.adjustments.length > 0) {
        rawHours = log.adjustments[0].corrected_hours;
      } else {
        const clockOut = log.clock_out_at ? new Date(log.clock_out_at) : new Date(shift.scheduled_end);
        rawHours = Math.max(0.5, (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60));
      }
      
      const hours      = Math.round(rawHours * 100) / 100;
      
      // Use worker's wage rate
      const appliedRate = worker.wage_rates && worker.wage_rates.length > 0 ? worker.wage_rates[0].amount : 45.0;

      const lineTotal = Math.round(hours * appliedRate * 100) / 100;
      subtotal += lineTotal;

      lineItemsData.push({
        time_log_id:      log.id,
        worker_id:        worker.id,
        worker_name:      worker.name,
        client_id:        client.id,
        shift_date:       shiftDateStr,
        hours,
        bill_rate_applied: appliedRate,
        line_total:       lineTotal,
      });
    }

    subtotal      = Math.round(subtotal * 100) / 100;
    const taxAmount = Math.round(subtotal * 0.10 * 100) / 100; // 10% GST
    const total   = Math.round((subtotal + taxAmount) * 100) / 100;

    const invoice = await prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          payer_id:             params.payer_id,
          agency_id:            params.agency_id,
          currency,
          billing_period_start: startDate,
          billing_period_end:   endDate,
          status:               'draft',
          issued_at:            issuedAt,
          due_at:               dueAt,
          subtotal,
          tax_amount:           taxAmount,
          total,
        },
      });

      for (const item of lineItemsData) {
        await tx.invoiceLineItem.create({
          data: {
            invoice_id:        created.id,
            time_log_id:       item.time_log_id,
            worker_id:         item.worker_id,
            client_id:         item.client_id,
            shift_date:        item.shift_date,
            hours:             item.hours,
            bill_rate_applied: item.bill_rate_applied,
            line_total:        item.line_total,
          },
        });

        await tx.timeLog.update({
          where: { id: item.time_log_id },
          data: { status: 'billed', billed_at: new Date() },
        });
      }

      return created;
    });

    await recordAuditLog({
      agency_id:      params.agency_id,
      actor_user_id:  params.actor_user_id,
      entity_type:    'Invoice',
      entity_id:      invoice.id,
      action:         'CREATE_INVOICE',
      after:          { total, client_id: client.id, client_name: client.name, line_items_count: lineItemsData.length },
    });

    const full = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        payer:      true,
        agency:     true,
        line_items: { include: { worker: true, client: true, time_log: true } },
        payments:   true,
      },
    });

    createdInvoices.push(full);
  }

  return createdInvoices;
}

/* ─────────────────────────────────────────────────────────────────
   LEGACY: kept for backward compat + integration tests
   ───────────────────────────────────────────────────────────────── */
export async function generateInvoiceFromTimeLogs(params: {
  agency_id: string;
  payer_id: string;
  billing_period_start: string;
  billing_period_end: string;
  actor_user_id: string;
  currency?: string;
}) {
  const invoices = await generateInvoicesPerClient(params);
  // Legacy callers expect a single invoice — return the first one
  return invoices[0];
}

/* ─────────────────────────────────────────────────────────────────
   PDF GENERATION — per-client, grouped by worker
   ───────────────────────────────────────────────────────────────── */
export function generateInvoicePDFBuffer(invoice: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc      = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end',  () => resolve(Buffer.concat(buffers)));

      const PRIMARY   = '#4f46e5';
      const DARK      = '#111827';
      const MUTED     = '#6b7280';
      const LIGHT_BG  = '#f9fafb';
      const currency  = invoice.currency || 'AUD';

      // ── Header band ──
      doc.rect(0, 0, doc.page.width, 110).fill(PRIMARY);
      doc.fill('#ffffff').fontSize(22).font('Helvetica-Bold')
        .text(invoice.agency?.name || 'Staffing Agency', 50, 28);
      doc.fontSize(11).font('Helvetica').fill('rgba(255,255,255,0.85)')
        .text('TAX INVOICE', 50, 56);

      // Invoice number badge
      const invNum = `INV-${invoice.id.substring(0, 8).toUpperCase()}`;
      doc.fontSize(14).font('Helvetica-Bold').fill('#ffffff')
        .text(invNum, doc.page.width - 200, 38, { width: 150, align: 'right' });

      doc.fill(DARK).fontSize(10);

      // ── Invoice meta ──
      let y = 130;
      const col1 = 50, col2 = 300;

      // Left: billed-to
      doc.font('Helvetica-Bold').text('BILLED TO', col1, y);
      doc.font('Helvetica').fill(MUTED)
        .text(invoice.payer?.name || '—', col1, y + 16);
      if (invoice.payer?.billing_email) doc.text(invoice.payer.billing_email, col1, y + 30);
      if (invoice.payer?.abn)           doc.text(`ABN: ${invoice.payer.abn}`, col1, y + 44);

      // Right: invoice details
      doc.font('Helvetica-Bold').fill(DARK).text('INVOICE DETAILS', col2, y);
      doc.font('Helvetica').fill(MUTED);
      const details = [
        ['Issue Date',      new Date(invoice.issued_at).toLocaleDateString('en-AU')],
        ['Due Date',        new Date(invoice.due_at).toLocaleDateString('en-AU')],
        ['Billing Period',  `${new Date(invoice.billing_period_start).toLocaleDateString('en-AU')} – ${new Date(invoice.billing_period_end).toLocaleDateString('en-AU')}`],
        ['Currency',        currency],
      ];
      details.forEach(([label, val], i) => {
        doc.font('Helvetica-Bold').fill(DARK).text(`${label}:`, col2, y + 16 + i * 14, { continued: true });
        doc.font('Helvetica').fill(MUTED).text(` ${val}`);
      });

      // ── Client section ──
      y = 240;
      // Get unique client name from line items
      const clientName = invoice.line_items?.[0]?.client?.name || 'Client';
      doc.rect(col1, y, doc.page.width - 100, 28).fill('#eef2ff');
      doc.fill(PRIMARY).font('Helvetica-Bold').fontSize(11)
        .text(`Client: ${clientName}`, col1 + 10, y + 8);
      y += 38;

      // ── Line items table header ──
      doc.rect(col1, y, doc.page.width - 100, 22).fill(DARK);
      doc.fill('#ffffff').font('Helvetica-Bold').fontSize(9);
      const cols = { date: col1 + 6, worker: col1 + 80, hours: col1 + 260, rate: col1 + 320, total: col1 + 390 };
      doc.text('SHIFT DATE',  cols.date,   y + 7);
      doc.text('WORKER',      cols.worker, y + 7);
      doc.text('HOURS',       cols.hours,  y + 7);
      doc.text(`RATE (${currency})`, cols.rate, y + 7);
      doc.text(`TOTAL (${currency})`, cols.total, y + 7);
      y += 22;

      // ── Group line items by worker ──
      const byWorker = new Map<string, any[]>();
      for (const item of (invoice.line_items || [])) {
        const wname = item.worker?.name || 'Unknown';
        if (!byWorker.has(wname)) byWorker.set(wname, []);
        byWorker.get(wname)!.push(item);
      }

      let rowIndex = 0;
      for (const [workerName, items] of byWorker) {
        let workerSubtotal = 0;

        for (const item of items) {
          if (y > doc.page.height - 120) { doc.addPage(); y = 50; }

          const bg = rowIndex % 2 === 0 ? '#ffffff' : LIGHT_BG;
          doc.rect(col1, y, doc.page.width - 100, 18).fill(bg);
          doc.fill(DARK).font('Helvetica').fontSize(8.5);
          doc.text(item.shift_date || '—',                   cols.date,   y + 5, { width: 70 });
          doc.text(workerName,                               cols.worker, y + 5, { width: 170 });
          doc.text(item.hours.toFixed(2) + 'h',             cols.hours,  y + 5, { width: 54 });
          doc.text(`$${item.bill_rate_applied.toFixed(2)}`, cols.rate,   y + 5, { width: 60 });
          doc.font('Helvetica-Bold')
            .text(`$${item.line_total.toFixed(2)}`,         cols.total,  y + 5, { width: 65 });
          workerSubtotal += item.line_total;
          y += 18;
          rowIndex++;
        }

        // Worker subtotal row
        if (y > doc.page.height - 100) { doc.addPage(); y = 50; }
        doc.rect(col1, y, doc.page.width - 100, 16).fill('#e0e7ff');
        doc.fill(PRIMARY).font('Helvetica-Bold').fontSize(8)
          .text(`Subtotal — ${workerName}`, cols.date, y + 4, { width: 350 });
        doc.text(`$${workerSubtotal.toFixed(2)}`, cols.total, y + 4, { width: 65 });
        y += 20;
      }

      // ── Totals ──
      if (y > doc.page.height - 130) { doc.addPage(); y = 50; }
      y += 12;
      const totX = doc.page.width - 230;
      const totW = 180;

      const drawTotalLine = (label: string, value: string, bold = false, highlight = false) => {
        if (highlight) doc.rect(totX - 10, y - 3, totW + 10, 22).fill(PRIMARY);
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(bold ? 10 : 9)
           .fill(highlight ? '#ffffff' : (bold ? DARK : MUTED));
        doc.text(label, totX, y, { width: totW / 2 });
        doc.text(value, totX + totW / 2, y, { width: totW / 2, align: 'right' });
        y += highlight ? 26 : 18;
      };

      drawTotalLine('Subtotal',            `${currency} $${invoice.subtotal.toFixed(2)}`);
      drawTotalLine('GST (10%)',           `${currency} $${invoice.tax_amount.toFixed(2)}`);
      drawTotalLine('TOTAL AMOUNT DUE',   `${currency} $${invoice.total.toFixed(2)}`, true, true);

      // ── Footer ──
      const footerY = doc.page.height - 55;
      doc.rect(0, footerY, doc.page.width, 55).fill('#f3f4f6');
      doc.fill(MUTED).font('Helvetica').fontSize(8)
        .text(`Generated by ${invoice.agency?.name || 'Staffing Agency'} · ${invNum} · Please remit by ${new Date(invoice.due_at).toLocaleDateString('en-AU')}`,
          50, footerY + 18, { align: 'center', width: doc.page.width - 100 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
