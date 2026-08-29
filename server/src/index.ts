import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import payerRoutes from './routes/payerRoutes';
import clientRoutes from './routes/clientRoutes';
import workerRoutes from './routes/workerRoutes';
import requirementRoutes from './routes/requirementRoutes';
import rosterRoutes from './routes/rosterRoutes';
import attendanceRoutes from './routes/attendanceRoutes';
import billingRoutes from './routes/billingRoutes';
import matchingRoutes from './routes/matchingRoutes';
import configRoutes from './routes/configRoutes';
import { prisma } from './db';
import { UPLOADS_DIR } from './middleware/upload';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Serve uploaded files (requires token via query param for auth)
app.use('/uploads', express.static(UPLOADS_DIR));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/payers', payerRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/requirements', requirementRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/matching', matchingRoutes);
app.use('/api/config', configRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Staffing Agency Management Monolith', timestamp: new Date() });
});

// Multer error handler
app.use((err: any, req: any, res: any, next: any) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large. Max 20 MB.' });
  if (err?.message) return res.status(400).json({ error: err.message });
  next(err);
});

const DEFAULT_ROLES = [
  { name: 'Care Worker', description: 'Provides personal care and support to clients' },
  { name: 'RN Registered Nurse', description: 'Registered Nurse with clinical qualifications' },
  { name: 'EN Enrolled Nurse', description: 'Enrolled Nurse under RN supervision' },
  { name: 'Support Worker', description: 'Community support and daily living assistance' },
  { name: 'Team Leader', description: 'Senior staff responsible for shift coordination' },
  { name: 'Allied Health Professional', description: 'OT, Physio, Speech Pathology, etc.' },
];

async function seedDefaultRoles() {
  try {
    const agency = await prisma.agency.findFirst();
    if (!agency) return;
    for (const role of DEFAULT_ROLES) {
      await prisma.workerRole.upsert({
        where: { agency_id_name: { agency_id: agency.id, name: role.name } },
        update: {},
        create: { agency_id: agency.id, name: role.name, description: role.description },
      });
    }
    console.log('✅ Default worker roles seeded.');
  } catch (e) {
    console.warn('Role seeding skipped:', e);
  }
}

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, async () => {
    console.log(`⚡ Staffing Management API running on http://localhost:${PORT}`);
    await seedDefaultRoles();
  });
}

export default app;
