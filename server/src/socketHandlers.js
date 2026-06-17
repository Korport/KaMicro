/**
 * Socket.IO event contract
 * ═══════════════════════════════════════════════════════════════
 * CLIENT → SERVER
 * ───────────────────────────────────────────────────────────────
 * host:create_room      {}
 * host:reconnect        { roomCode, hostToken }
 * host:start_game       { roomCode, hostToken, questions[], timeLimit }
 * host:advance          { roomCode, hostToken }   — skip timer OR next question
 *
 * player:join           { roomCode, nickname, playerId? }
 * player:answer         { answer: 'a'|'b'|'c'|'d' }   — socket carries roomCode+playerId
 *
 * SERVER → CLIENT
 * ───────────────────────────────────────────────────────────────
 * room:created          { roomCode, qrCode, hostToken }              → host
 * host:reconnected      { roomCode, qrCode, phase, players[] }       → host
 * host:reconnect_failed {}                                            → host
 *
 * room:player_joined    { players[] }                                 → host socket
 * room:player_left      { playerId, players[] }                       → host socket
 * game:answer_count     { answered, total }                           → host socket
 *
 * player:joined         { playerId, nickname, players[], phase }      → joining player
 * player:answer_locked  { answer }                                    → answering player
 * player:result         { isCorrect, delta, score }                   → player socket
 *
 * game:started          { questionCount }                             → room broadcast
 * game:question         { questionIndex, totalQuestions, question,
 *                         answers:{a,b,c,d}, gifUrl, timeLimit }      → room broadcast
 * game:timer_tick       { remaining }                                 → room broadcast
 * game:reveal           { correct, distribution:{a,b,c,d},
 *                         leaderboard[] }                             → room broadcast
 * game:end              { leaderboard[], winnerGifUrl }               → room broadcast
 *
 * error                 { message }                                   → relevant socket
 * ═══════════════════════════════════════════════════════════════
 */

import * as gm from './gameManager.js';
import { generateQR } from './utils/qr.js';

const GIPHY_SEARCH = 'https://api.giphy.com/v1/gifs/search';
const GIPHY_RANDOM = 'https://api.giphy.com/v1/gifs/random';

const WINNER_TAGS = ['winner celebration', 'confetti party', 'trophy winner', 'victory celebration', 'you win'];

async function fetchGif(keyword) {
  const key = process.env.GIPHY_API_KEY;
  if (!key || !keyword) return null;
  try {
    const url = `${GIPHY_SEARCH}?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(keyword)}&limit=1&rating=g`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.images?.original?.url ?? null;
  } catch {
    return null;
  }
}

async function fetchWinnerGif() {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return null;
  const tag = WINNER_TAGS[Math.floor(Math.random() * WINNER_TAGS.length)];
  try {
    const url = `${GIPHY_RANDOM}?api_key=${encodeURIComponent(key)}&tag=${encodeURIComponent(tag)}&rating=g`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.images?.original?.url ?? null;
  } catch {
    return null;
  }
}

export function registerHandlers(io, domain) {
  // Per-room countdown intervals
  const timers = new Map();

  function clearTimer(roomCode) {
    if (timers.has(roomCode)) {
      clearInterval(timers.get(roomCode));
      timers.delete(roomCode);
    }
  }

  function startTimer(roomCode, timeLimit) {
    clearTimer(roomCode);
    let remaining = timeLimit;
    const id = setInterval(async () => {
      remaining -= 1;
      io.to(roomCode).emit('game:timer_tick', { remaining });
      if (remaining <= 0) {
        clearTimer(roomCode);
        await doReveal(roomCode);
      }
    }, 1000);
    timers.set(roomCode, id);
  }

  async function doReveal(roomCode) {
    const result = gm.revealQuestion(roomCode);
    if (!result) return;
    const room = gm.getRoom(roomCode);
    if (!room) return;

    io.to(roomCode).emit('game:reveal', {
      correct: result.correct,
      distribution: result.distribution,
      leaderboard: result.leaderboard,
    });

    // Individual feedback per player
    for (const r of result.results) {
      const player = room.players.get(r.playerId);
      if (player?.socketId) {
        io.to(player.socketId).emit('player:result', {
          isCorrect: r.isCorrect,
          delta: r.delta,
          score: r.score,
        });
      }
    }

    // Players who never answered
    const answered = new Set(result.results.map((r) => r.playerId));
    for (const player of room.players.values()) {
      if (!answered.has(player.id) && player.socketId) {
        io.to(player.socketId).emit('player:result', {
          isCorrect: false,
          delta: 0,
          score: player.score,
        });
      }
    }
  }

  async function sendNextQuestion(roomCode) {
    const room = gm.getRoom(roomCode);
    if (!room) return;

    const question = gm.nextQuestion(roomCode);
    if (!question) {
      room.phase = 'end';
      const winnerGifUrl = await fetchWinnerGif();
      io.to(roomCode).emit('game:end', { leaderboard: gm.buildLeaderboard(room), winnerGifUrl });
      return;
    }

    const gifUrl = await fetchGif(question.giphy_keyword);

    io.to(roomCode).emit('game:question', {
      questionIndex: room.currentQuestionIndex,
      totalQuestions: room.questions.length,
      question: question.question,
      answers: {
        a: question.answer_a,
        b: question.answer_b,
        c: question.answer_c,
        d: question.answer_d,
      },
      gifUrl,
      timeLimit: room.timeLimit,
    });

    startTimer(roomCode, room.timeLimit);
  }

  // ─── Connection ──────────────────────────────────────────────
  io.on('connection', (socket) => {

    // HOST ──────────────────────────────────────────────────────

    socket.on('host:create_room', async () => {
      const { code, hostToken } = gm.createRoom(socket.id);
      await socket.join(code);
      const qrCode = await generateQR(`${domain}/join/${code}`);
      socket.emit('room:created', { roomCode: code, qrCode, hostToken });
    });

    socket.on('host:reconnect', async ({ roomCode, hostToken }) => {
      const room = gm.getRoom(roomCode);
      if (!room || room.hostToken !== hostToken) {
        socket.emit('host:reconnect_failed');
        return;
      }
      room.hostSocketId = socket.id;
      await socket.join(roomCode);
      const qrCode = await generateQR(`${domain}/join/${roomCode}`);
      socket.emit('host:reconnected', {
        roomCode,
        qrCode,
        phase: room.phase,
        players: gm.playerList(room),
        questionCount: room.questions.length,
      });
    });

    socket.on('host:start_game', async ({ roomCode, hostToken, questions, timeLimit = 20 }) => {
      const room = gm.getRoom(roomCode);
      if (!room || room.hostToken !== hostToken) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }
      if (!questions?.length) {
        socket.emit('error', { message: 'No questions loaded' });
        return;
      }
      gm.setQuestions(roomCode, questions, timeLimit);
      if (!gm.startGame(roomCode)) {
        socket.emit('error', { message: 'Cannot start game' });
        return;
      }
      io.to(roomCode).emit('game:started', { questionCount: questions.length });
      await sendNextQuestion(roomCode);
    });

    // Skip timer (in question) or advance (in reveal)
    socket.on('host:advance', async ({ roomCode, hostToken }) => {
      const room = gm.getRoom(roomCode);
      if (!room || room.hostToken !== hostToken) return;

      if (room.phase === 'question') {
        clearTimer(roomCode);
        await doReveal(roomCode);
      } else if (room.phase === 'reveal') {
        await sendNextQuestion(roomCode);
      }
    });

    // PLAYER ────────────────────────────────────────────────────

    socket.on('player:join', async ({ roomCode, nickname, playerId }) => {
      const room = gm.getRoom(roomCode);
      if (!room) {
        socket.emit('error', { message: 'Room not found' });
        return;
      }
      const player = gm.addPlayer(roomCode, socket.id, nickname?.trim().slice(0, 20), playerId ?? null);
      if (!player) {
        socket.emit('error', { message: 'Room is full (max 10 players)' });
        return;
      }
      socket.data.roomCode = roomCode;
      socket.data.playerId = player.id;
      await socket.join(roomCode);

      const players = gm.playerList(room);
      socket.emit('player:joined', {
        playerId: player.id,
        nickname: player.nickname,
        players,
        phase: room.phase,
      });
      // Notify host
      io.to(room.hostSocketId).emit('room:player_joined', { players });
    });

    socket.on('player:answer', ({ answer }) => {
      const { roomCode, playerId } = socket.data;
      if (!roomCode || !playerId) return;
      if (!['a', 'b', 'c', 'd'].includes(answer)) return;

      const recorded = gm.recordAnswer(roomCode, playerId, answer);
      if (!recorded) return;

      socket.emit('player:answer_locked', { answer });

      const room = gm.getRoom(roomCode);
      if (!room) return;
      const answered = room.answersThisRound.size;
      const total = gm.connectedPlayerCount(room);
      io.to(room.hostSocketId).emit('game:answer_count', { answered, total });

      // Auto-reveal when everyone has answered
      if (answered >= total) {
        clearTimer(roomCode);
        doReveal(roomCode);
      }
    });

    // DISCONNECT ────────────────────────────────────────────────

    socket.on('disconnect', () => {
      // Host disconnect — keep room alive; host can reconnect via hostToken
      const hostedRoom = gm.findRoomByHostSocket(socket.id);
      if (hostedRoom) {
        clearTimer(hostedRoom.code);
        return;
      }

      // Player disconnect
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;
      const player = gm.markPlayerDisconnected(roomCode, socket.id);
      if (!player) return;
      const room = gm.getRoom(roomCode);
      if (!room) return;
      io.to(room.hostSocketId).emit('room:player_left', {
        playerId: player.id,
        players: gm.playerList(room),
      });
    });
  });
}
