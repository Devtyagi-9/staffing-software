import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db';

export const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-staffing-key-2026';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    agency_id: string;
    email: string;
    role: string;
    linked_worker_id?: string | null;
  };
  agencyId?: string;
}

export async function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  // Accept token from header OR ?token= query param (for browser file downloads)
  const token = (authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null)
    ?? (req.query?.token as string | undefined);

  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    req.user = payload;
    req.agencyId = payload.agency_id;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Forbidden: requires one of roles [${allowedRoles.join(', ')}]` });
    }
    next();
  };
}
