const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const admin = await prisma.user.findFirst({ where: { email: 'admin@apexstaffing.com.au' } });
  const payer = await prisma.payer.findFirst();
  console.log("Found admin:", admin.id, "payer:", payer.id);

  const res = await fetch('http://localhost:4000/api/billing/invoices/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.TOKEN}` },
    body: JSON.stringify({
      payer_id: payer.id,
      billing_period_start: '2026-08-01',
      billing_period_end: '2026-08-31'
    })
  });
  
  const text = await res.text();
  console.log("Generate response:", res.status, text);
}
run();
