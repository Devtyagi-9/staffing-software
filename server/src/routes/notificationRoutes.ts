import { Router, Response } from 'express';
import { prisma } from '../db';
import { authenticateJWT, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/notifications/register-token
// Called by the mobile app after obtaining an Expo push token.
// Saves the token against the authenticated user's account so the server
// can send targeted push notifications to that device.
// ---------------------------------------------------------------------------
router.post('/register-token', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  const { push_token } = req.body;

  if (!push_token || typeof push_token !== 'string') {
    return res.status(400).json({ error: 'push_token is required and must be a string.' });
  }

  if (!push_token.startsWith('ExponentPushToken[') && !push_token.startsWith('ExpoPushToken[')) {
    return res.status(400).json({ error: 'Invalid Expo push token format.' });
  }

  await prisma.user.update({
    where: { id: req.user!.id },
    data: { push_token },
  });

  console.log(`[Notifications] Registered push token for user ${req.user!.id} (${req.user!.email})`);
  res.json({ success: true, message: 'Push token registered successfully.' });
});

// ---------------------------------------------------------------------------
// DELETE /api/notifications/register-token
// Called on logout to unregister the push token so the user stops receiving
// notifications when not logged in.
// ---------------------------------------------------------------------------
router.delete('/register-token', authenticateJWT, async (req: AuthenticatedRequest, res: Response) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { push_token: null },
  });

  console.log(`[Notifications] Cleared push token for user ${req.user!.id} (${req.user!.email})`);
  res.json({ success: true, message: 'Push token cleared.' });
});

export default router;
