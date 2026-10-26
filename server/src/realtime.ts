import type { Server } from 'socket.io';

export interface Realtime {
  toWorkspace: (workspaceId: string, event: string, payload: unknown) => void;
  toUser: (userId: string, event: string, payload: unknown) => void;
}

export function realtimeFrom(io?: Server): Realtime | undefined {
  if (!io) return undefined;
  return {
    toWorkspace(workspaceId, event, payload) {
      io.to(`workspace:${workspaceId}`).emit(event, payload);
    },
    toUser(userId, event, payload) {
      io.to(`user:${userId}`).emit(event, payload);
    },
  };
}

export function ioFromApp(app: { get: (key: string) => unknown }) {
  return app.get('io') as Server | undefined;
}
