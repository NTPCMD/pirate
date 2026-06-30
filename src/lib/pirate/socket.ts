// Singleton socket.io client for the Pirate Game.
// Connects to the mini-service via the gateway using XTransformPort.
// IMPORTANT: XTransformPort must be in the `query` option (NOT just the
// namespace URL) so socket.io includes it on EVERY transport request
// (polling + websocket upgrade). The Caddy gateway routes based on this.
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    path: '/',
    transports: ['polling', 'websocket'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    timeout: 10000,
    query: {
      XTransformPort: '3003',
    },
  });
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
