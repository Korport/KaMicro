/**
 * In-memory game state.
 *
 * Room shape:
 * {
 *   code, hostToken, hostSocketId,
 *   players: Map<playerId, Player>,
 *   questions: Question[],
 *   currentQuestionIndex: number,
 *   phase: 'lobby'|'question'|'reveal'|'end',
 *   questionStartTime: number (ms),
 *   timeLimit: number (seconds),
 *   answersThisRound: Map<playerId, {answer, elapsed}>,
 * }
 *
 * Scoring formula:
 *   BASE = 1000, SPEED_MAX = 500
 *   delta = BASE + round(SPEED_MAX * max(0, 1 - elapsed / (timeLimit * 1000)))
 *   Wrong answer → delta = 0
 */

const rooms = new Map();

const BASE_POINTS = 1000;
const SPEED_BONUS_MAX = 500;

function rnd(len, chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ') {
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function uniqueRoomCode() {
  let code;
  do { code = rnd(4); } while (rooms.has(code));
  return code;
}

export function createRoom(hostSocketId, timeLimit = 20) {
  const code = uniqueRoomCode();
  const hostToken = rnd(24, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  rooms.set(code, {
    code,
    hostToken,
    hostSocketId,
    players: new Map(),
    questions: [],
    currentQuestionIndex: -1,
    phase: 'lobby',
    questionStartTime: null,
    timeLimit,
    answersThisRound: new Map(),
  });
  return { code, hostToken };
}

export function getRoom(code) {
  return rooms.get(code) ?? null;
}

export function getRoomByHostToken(hostToken) {
  for (const room of rooms.values()) {
    if (room.hostToken === hostToken) return room;
  }
  return null;
}

export function deleteRoom(code) {
  rooms.delete(code);
}

/** Returns player on success, null if room full or room missing. */
export function addPlayer(roomCode, socketId, nickname, existingPlayerId = null) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  // Reconnect path — same player, new socket
  if (existingPlayerId && room.players.has(existingPlayerId)) {
    const player = room.players.get(existingPlayerId);
    player.socketId = socketId;
    player.connected = true;
    return player;
  }

  if (room.players.size >= 10) return null;

  const id = rnd(10, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
  const player = { id, socketId, nickname, score: 0, connected: true };
  room.players.set(id, player);
  return player;
}

export function markPlayerDisconnected(roomCode, socketId) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  for (const player of room.players.values()) {
    if (player.socketId === socketId) {
      player.connected = false;
      return player;
    }
  }
  return null;
}

export function setQuestions(roomCode, questions, timeLimit) {
  const room = rooms.get(roomCode);
  if (!room) return false;
  room.questions = questions;
  if (timeLimit) room.timeLimit = timeLimit;
  return true;
}

/** Returns false if no questions loaded. */
export function startGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.questions.length === 0) return false;
  room.currentQuestionIndex = -1;
  room.phase = 'question';
  return true;
}

/** Advances to next question. Returns question object or null when exhausted. */
export function nextQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return null;
  room.currentQuestionIndex += 1;
  if (room.currentQuestionIndex >= room.questions.length) return null;
  room.answersThisRound = new Map();
  room.questionStartTime = Date.now();
  room.phase = 'question';
  return room.questions[room.currentQuestionIndex];
}

/** Returns recorded result or null if already answered / bad phase. */
export function recordAnswer(roomCode, playerId, answer) {
  const room = rooms.get(roomCode);
  if (!room || room.phase !== 'question') return null;
  if (room.answersThisRound.has(playerId)) return null;
  const elapsed = Date.now() - room.questionStartTime;
  room.answersThisRound.set(playerId, { answer, elapsed });
  return { answer, elapsed };
}

/** Scores all answers, updates player scores, sets phase to 'reveal'. */
export function revealQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return null;

  const question = room.questions[room.currentQuestionIndex];
  const correct = question.correct;
  const timeLimitMs = room.timeLimit * 1000;

  const distribution = { a: 0, b: 0, c: 0, d: 0 };
  for (const { answer } of room.answersThisRound.values()) {
    if (answer in distribution) distribution[answer]++;
  }

  const results = [];
  for (const [playerId, { answer, elapsed }] of room.answersThisRound) {
    const player = room.players.get(playerId);
    if (!player) continue;
    const isCorrect = answer === correct;
    const speedBonus = isCorrect
      ? Math.round(SPEED_BONUS_MAX * Math.max(0, 1 - elapsed / timeLimitMs))
      : 0;
    const delta = isCorrect ? BASE_POINTS + speedBonus : 0;
    player.score += delta;
    results.push({ playerId, nickname: player.nickname, isCorrect, delta, score: player.score });
  }

  room.phase = 'reveal';
  return { correct, distribution, results, leaderboard: buildLeaderboard(room) };
}

export function buildLeaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score)
    .map((p, i) => ({ rank: i + 1, playerId: p.id, nickname: p.nickname, score: p.score }));
}

export function getLeaderboard(roomCode) {
  const room = rooms.get(roomCode);
  return room ? buildLeaderboard(room) : [];
}

export function isLastQuestion(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return true;
  return room.currentQuestionIndex >= room.questions.length - 1;
}

export function connectedPlayerCount(room) {
  let n = 0;
  for (const p of room.players.values()) if (p.connected) n++;
  return n;
}

export function findRoomByHostSocket(socketId) {
  for (const room of rooms.values()) {
    if (room.hostSocketId === socketId) return room;
  }
  return null;
}

export function findRoomAndPlayerBySocket(socketId) {
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (player.socketId === socketId) return { room, player };
    }
  }
  return null;
}

export function playerList(room) {
  return [...room.players.values()].map(({ id, nickname, score, connected }) => ({
    id, nickname, score, connected,
  }));
}
