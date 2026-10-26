import type { Server } from 'socket.io';
import { COOKIE_NAME } from './config';
import { verifyToken } from './middleware/auth';
import { Membership } from './models/Membership';
import { assertObjectId } from './utils';

function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function registerSocket(io: Server) {
  io.use((socket, next) => {
    const token =
      readCookie(socket.handshake.headers.cookie, COOKIE_NAME) ||
      (typeof socket.handshake.auth?.token === 'string' ? socket.handshake.auth.token : undefined);
    const userId = token ? verifyToken(token) : null;
    if (!userId) {
      next(new Error('Unauthorized'));
      return;
    }
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (socket) => {
    const userId = String(socket.data.userId);
    socket.join(`user:${userId}`);

    socket.on('workspace:join', async (workspaceId: unknown, ack?: (result: { ok: boolean }) => void) => {
      if (typeof workspaceId !== 'string' || !workspaceId) {
        ack?.({ ok: false });
        return;
      }
      try {
        assertObjectId(workspaceId, 'workspace id');
      } catch {
        ack?.({ ok: false });
        return;
      }
      const membership = await Membership.findOne({ workspace: workspaceId, user: userId }).select('_id').lean();
      if (!membership) {
        ack?.({ ok: false });
        return;
      }
      socket.join(`workspace:${workspaceId}`);
      ack?.({ ok: true });
    });

    socket.on('workspace:leave', (workspaceId: unknown) => {
      if (typeof workspaceId === 'string') socket.leave(`workspace:${workspaceId}`);
    });
  });
}
