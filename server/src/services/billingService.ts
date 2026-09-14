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
      const shiftStartTime = shift.client_requirement.start_time || null;
      const shiftEndTime = shift.client_requirement.end_time || null;

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
        shift_start_time: shiftStartTime,
        shift_end_time:   shiftEndTime,
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
            shift_start_time:  item.shift_start_time,
            shift_end_time:    item.shift_end_time,
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
   HELPERS
   ───────────────────────────────────────────────────────────────── */
function formatTime12(hhmm: string | null | undefined): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}${suffix}`;
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()] || 'Weekday';
}

function formatDateDDMMYYYY(dateStr: string): string {
  const parts = dateStr.split('-'); // YYYY-MM-DD
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

function formatDateLong(d: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/* ─────────────────────────────────────────────────────────────────
   AGENCY CONSTANTS (hardcoded for now — can be moved to DB later)
   ───────────────────────────────────────────────────────────────── */
const AGENCY_DETAILS = {
  address_line_1: '438b Chesterville Rd',
  address_line_2: 'BENTLEIGH EAST VIC 3165',
  abn: '77694705112',
  email: 'info@apexstaffing.com.au',
  phone: '+61 0469070434',
  bank: {
    account_name: 'Apex Staffing Solutions Pty Ltd',
    bsb: '067873',
    account_number: '23790512',
  },
  contact: {
    title: 'Finance officer',
    phone: '0469 070 434',
    email: 'info@apexstaffing.com.au',
  },
};

/* ─────────────────────────────────────────────────────────────────
   PDF GENERATION — Xero-style Tax Invoice
   ───────────────────────────────────────────────────────────────── */
export function generateInvoicePDFBuffer(invoice: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc      = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers: Buffer[] = [];

      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end',  () => resolve(Buffer.concat(buffers)));

      const DARK      = '#111827';
      const MUTED     = '#6b7280';
      const LIGHT_BG  = '#f5f5f5';
      const BLUE_LINK = '#1a73e8';
      const currency  = invoice.currency || 'AUD';
      const agencyName = invoice.agency?.name || 'Apex Staffing Solutions Australia';
      const invNum    = `INV-${invoice.id.substring(0, 8).toUpperCase()}`;
      const clientName = invoice.line_items?.[0]?.client?.name || 'Client';
      const issuedAt  = new Date(invoice.issued_at);
      const dueAt     = new Date(invoice.due_at);
      const pageW     = doc.page.width;
      const leftM     = 50;
      const rightM    = pageW - 50;
      const contentW  = rightM - leftM;

      let y = 50;

      // ═══════════════════════════════════════════════════════════
      // TITLE: "Tax Invoice"
      // ═══════════════════════════════════════════════════════════
      doc.font('Helvetica-Bold').fontSize(24).fill(DARK)
        .text('Tax Invoice', leftM, y);
      y += 45;

      // ═══════════════════════════════════════════════════════════
      // FROM / TO SECTION
      // ═══════════════════════════════════════════════════════════
      // Left: Payer (billed to)
      doc.font('Helvetica').fontSize(10).fill(DARK);
      const payerName = invoice.payer?.name || '—';
      doc.text(payerName, leftM, y);
      const payerY = y + 14;
      if (invoice.payer?.billing_email) {
        doc.fill(MUTED).text(invoice.payer.billing_email, leftM, payerY);
      }

      // Right: Agency details
      const rightColX = pageW - 250;
      doc.font('Helvetica-Bold').fontSize(10).fill(DARK)
        .text(agencyName, rightColX, y, { width: 200, align: 'right' });
      doc.font('Helvetica').fontSize(9).fill(DARK);
      let ry = y + 14;
      doc.text(AGENCY_DETAILS.address_line_1, rightColX, ry, { width: 200, align: 'right' });
      ry += 12;
      doc.text(AGENCY_DETAILS.address_line_2, rightColX, ry, { width: 200, align: 'right' });
      ry += 16;
      doc.text(`ABN: ${AGENCY_DETAILS.abn}`, rightColX, ry, { width: 200, align: 'right' });
      ry += 12;
      doc.text(AGENCY_DETAILS.email, rightColX, ry, { width: 200, align: 'right' });
      ry += 12;
      doc.text(AGENCY_DETAILS.phone, rightColX, ry, { width: 200, align: 'right' });

      y = Math.max(payerY + 20, ry + 20);
      y += 10;

      // ═══════════════════════════════════════════════════════════
      // SUMMARY ROW: Amount due | Due date | Issue date | Invoice # | Reference
      // ═══════════════════════════════════════════════════════════
      // Draw a light separator line
      doc.moveTo(leftM, y).lineTo(rightM, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      y += 14;

      const summaryLabels = ['Amount due', 'Due date', 'Issue date', 'Invoice number', 'Reference'];
      const summaryValues = [
        `$${invoice.total.toFixed(2)}`,
        formatDateLong(dueAt),
        formatDateLong(issuedAt),
        invNum,
        clientName,
      ];
      const colWidth = contentW / 5;

      // Labels
      doc.font('Helvetica').fontSize(8).fill(MUTED);
      summaryLabels.forEach((label, i) => {
        doc.text(label, leftM + i * colWidth, y, { width: colWidth });
      });
      y += 12;

      // Values
      doc.font('Helvetica-Bold').fill(DARK);
      summaryValues.forEach((val, i) => {
        const fontSize = i === 0 ? 16 : (i === 1 ? 14 : 10);
        doc.fontSize(fontSize).text(val, leftM + i * colWidth, y, { width: colWidth });
      });
      y += 28;

      // ═══════════════════════════════════════════════════════════
      // LINE ITEMS TABLE
      // ═══════════════════════════════════════════════════════════
      // Draw separator
      doc.moveTo(leftM, y).lineTo(rightM, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      y += 8;

      // Table header
      const tblCols = {
        desc:  leftM,
        qty:   leftM + 310,
        price: leftM + 370,
        tax:   leftM + 420,
        amt:   leftM + 460,
      };
      const tblColWidths = {
        desc:  305,
        qty:   55,
        price: 50,
        tax:   38,
        amt:   contentW - 460,
      };

      // Header row
      doc.font('Helvetica').fontSize(8.5).fill(MUTED);
      doc.text('Description',  tblCols.desc,  y, { width: tblColWidths.desc });
      doc.text('Quantity',     tblCols.qty,   y, { width: tblColWidths.qty, align: 'center' });
      doc.text('Price',        tblCols.price, y, { width: tblColWidths.price, align: 'right' });
      doc.text('Tax',          tblCols.tax,   y, { width: tblColWidths.tax, align: 'right' });
      doc.text('Amount',       tblCols.amt,   y, { width: tblColWidths.amt, align: 'right' });
      y += 14;

      // Thin line under header
      doc.moveTo(leftM, y).lineTo(rightM, y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
      y += 6;

      // ── Line items ──
      const lineItems = invoice.line_items || [];
      for (let i = 0; i < lineItems.length; i++) {
        const item = lineItems[i];

        if (y > doc.page.height - 200) { doc.addPage(); y = 50; }

        // Build description: "DD-MM-YYYY IND Assistance with Daily Living Weekday HH:MMpm HH:MMpm"
        const dateStr = item.shift_date ? formatDateDDMMYYYY(item.shift_date) : '—';
        const dayName = item.shift_date ? getDayOfWeek(item.shift_date) : 'Weekday';
        // Fallback: read shift times from nested time_log chain if not stored directly
        const rawStartTime = item.shift_start_time || item.time_log?.assignment?.shift?.client_requirement?.start_time || null;
        const rawEndTime = item.shift_end_time || item.time_log?.assignment?.shift?.client_requirement?.end_time || null;
        const startTime = formatTime12(rawStartTime);
        const endTime = formatTime12(rawEndTime);
        const description = `${dateStr} IND Assistance with Daily Living ${dayName} ${startTime} ${endTime}`.trim();

        // Alternating row background
        const rowH = 28;
        if (i % 2 === 1) {
          doc.rect(leftM - 4, y - 2, contentW + 8, rowH).fill(LIGHT_BG);
        }

        doc.font('Helvetica').fontSize(8.5).fill(DARK);
        doc.text(description, tblCols.desc, y + 4, { width: tblColWidths.desc });
        doc.text(item.hours.toFixed(0), tblCols.qty, y + 4, { width: tblColWidths.qty, align: 'center' });
        doc.text(item.bill_rate_applied.toFixed(2), tblCols.price, y + 4, { width: tblColWidths.price, align: 'right' });
        doc.text('0%', tblCols.tax, y + 4, { width: tblColWidths.tax, align: 'right' });
        doc.text(item.line_total.toFixed(2), tblCols.amt, y + 4, { width: tblColWidths.amt, align: 'right' });

        y += rowH;
      }

      // ═══════════════════════════════════════════════════════════
      // TOTALS SECTION (right-aligned)
      // ═══════════════════════════════════════════════════════════
      if (y > doc.page.height - 180) { doc.addPage(); y = 50; }

      y += 4;
      // Thin line
      doc.moveTo(leftM, y).lineTo(rightM, y).strokeColor('#d1d5db').lineWidth(0.5).stroke();
      y += 10;

      const totLabelX = tblCols.price - 20;
      const totValueX = tblCols.amt;
      const totValueW = tblColWidths.amt;

      // Subtotal
      doc.font('Helvetica').fontSize(9).fill(MUTED)
        .text('Subtotal', totLabelX, y, { width: 80, align: 'right' });
      doc.font('Helvetica').fill(DARK)
        .text(invoice.subtotal.toFixed(2), totValueX, y, { width: totValueW, align: 'right' });
      y += 18;

      // Total
      doc.font('Helvetica-Bold').fontSize(9).fill(DARK)
        .text('Total', totLabelX, y, { width: 80, align: 'right' });
      doc.text(invoice.total.toFixed(2), totValueX, y, { width: totValueW, align: 'right' });
      y += 22;

      // Amount due (large, bold)
      doc.font('Helvetica-Bold').fontSize(9).fill(DARK)
        .text('Amount due', totLabelX, y + 2, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(16).fill(DARK)
        .text(`$${invoice.total.toFixed(2)}`, totValueX - 20, y - 2, { width: totValueW + 20, align: 'right' });
      y += 30;

      // ═══════════════════════════════════════════════════════════
      // BANK DETAILS SECTION
      // ═══════════════════════════════════════════════════════════
      if (y > doc.page.height - 160) { doc.addPage(); y = 50; }

      y += 20;
      doc.moveTo(leftM, y).lineTo(rightM, y).strokeColor('#e5e7eb').lineWidth(1).stroke();
      y += 14;

      doc.font('Helvetica').fontSize(9).fill(DARK);
      doc.text('Amount to be transferred to below account:', leftM, y);
      y += 14;
      doc.font('Helvetica-Bold').text(`Account Name: ${AGENCY_DETAILS.bank.account_name}`, leftM, y);
      y += 13;
      doc.font('Helvetica').text(`BSB Number: ${AGENCY_DETAILS.bank.bsb}`, leftM, y);
      y += 13;
      doc.text(`Account Number: ${AGENCY_DETAILS.bank.account_number}`, leftM, y);

      // ═══════════════════════════════════════════════════════════
      // CONTACT INFORMATION SECTION
      // ═══════════════════════════════════════════════════════════
      y += 24;
      doc.font('Helvetica').fontSize(9).fill(DARK);
      doc.text('In case of any queries/concerns related to this invoice, please', leftM, y);
      y += 12;
      doc.text('contact', leftM, y);
      y += 14;
      doc.font('Helvetica-Bold').text(AGENCY_DETAILS.contact.title, leftM, y);
      y += 13;
      doc.font('Helvetica').text(`Ph: ${AGENCY_DETAILS.contact.phone}`, leftM, y);
      y += 13;
      doc.text(`Email: ${AGENCY_DETAILS.contact.email}`, leftM, y);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
