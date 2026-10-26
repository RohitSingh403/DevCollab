import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL || undefined, {
      path: '/socket.io',
      withCredentials: true,
      autoConnect: false,
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
}
