import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';

let socket: Socket | null = null;
let bridgeAttached = false;

export function getSocket(token: string) {
  if (!socket) {
    socket = io(API_URL, { transports: ['websocket'], auth: { token } });
  }
  if (!bridgeAttached && typeof window !== 'undefined') {
    bridgeAttached = true;
    window.addEventListener('letsmeet:voice-state', ((event: CustomEvent) => {
      socket?.emit('voice:state', event.detail);
    }) as EventListener);
  }
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
  bridgeAttached = false;
}
