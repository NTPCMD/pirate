// Singleton socket.io client for the Pirate Game.
// Connects to the mini-service via the gateway using XTransformPort.
// IMPORTANT: XTransformPort must be in the `query` option (NOT just the
// namespace URL) so socket.io includes it on EVERY transport request
// (polling + websocket upgrade). The Caddy gateway routes based on this.
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  const rawSocketUrl =
    process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3003';

  const socketUrl = rawSocketUrl.startsWith('http')
    ? rawSocketUrl
    : `https://${rawSocketUrl}`;

  socket = io(socketUrl, {
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 4000,
    timeout: 10000,
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
