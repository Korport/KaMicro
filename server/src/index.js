import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { registerHandlers } from './socketHandlers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const DOMAIN = process.env.DOMAIN || `http://localhost:5173`;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// In Docker: WORKDIR=/app, __dirname=/app/src, client/dist is at /app/client/dist
const clientDist = path.resolve(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' },
  // Allow long-polling fallback for restrictive networks
  transports: ['websocket', 'polling'],
});

registerHandlers(io, DOMAIN);

httpServer.listen(PORT, () => {
  console.log(`Trivia server listening on :${PORT}  (domain: ${DOMAIN})`);
});
