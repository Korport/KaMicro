import { io } from 'socket.io-client';

// Connects to same origin in both dev (Vite proxies /socket.io → :3001)
// and production (Caddy proxies everything to the Node server).
const socket = io(window.location.origin, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});

export default socket;
