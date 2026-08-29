import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';
import { JWT_SECRET, authenticateJWT, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { agency: true, linked_worker: true },
  });

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const validPassword = await bcrypt.compare(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      agency_id: user.agency_id,
      email: user.email,
      role: user.role,
      linked_worker_id: user.linked_worker_id,
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      agency_id: user.agency_id,
      agency_name: user.agency.name,
      default_currency: user.agency.default_currency,
      email: user.email,
      role: user.role,
      linked_worker_id: user.linked_worker_id,
      worker_name: user.linked_worker?.name,
    },
  });
});

router.get('/me', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { agency: true, linked_worker: true },
  });
  if (!user) return res.status(404).json({ error: 'User not found.' });

  return res.json({
    user: {
      id: user.id,
      agency_id: user.agency_id,
      agency_name: user.agency.name,
      default_currency: user.agency.default_currency,
      email: user.email,
      role: user.role,
      linked_worker_id: user.linked_worker_id,
      worker_name: user.linked_worker?.name,
    },
  });
});

// GET all users in agency (for case manager dropdown etc.)
router.get('/users', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const users = await prisma.user.findMany({
    where: { agency_id: req.agencyId, role: { in: ['admin', 'coordinator'] } },
    select: { id: true, email: true, role: true },
    orderBy: { email: 'asc' },
  });
  return res.json(users);
});

export default router;
