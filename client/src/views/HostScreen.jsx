import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import socket from '../socket.js';
import Timer from '../components/Timer.jsx';
import BarChart from '../components/BarChart.jsx';
import Leaderboard from '../components/Leaderboard.jsx';
import GifDisplay from '../components/GifDisplay.jsx';

// ─── helpers ─────────────────────────────────────────────────────────────────

function loadQuestions() {
  try { return JSON.parse(localStorage.getItem('trivia_questions') ?? '[]'); }
  catch { return []; }
}
function loadTimeLimit() {
  return Number(localStorage.getItem('trivia_time_limit') ?? 20);
}

// ─── component ────────────────────────────────────────────────────────────────

export default function HostScreen() {
  const [phase, setPhase] = useState('init');   // init | lobby | question | reveal | end
  const [roomCode, setRoomCode] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [players, setPlayers] = useState([]);
  const [questions, setQuestions] = useState(loadQuestions);
  const [currentQ, setCurrentQ] = useState(null);   // game:question payload
  const [timer, setTimer] = useState(0);
  const [answerCount, setAnswerCount] = useState({ answered: 0, total: 0 });
  const [revealData, setRevealData] = useState(null);  // { correct, distribution, leaderboard }
  const [finalLB, setFinalLB] = useState([]);
  const [winnerGifUrl, setWinnerGifUrl] = useState(null);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Reload questions from localStorage whenever the user saves from /settings
  useEffect(() => {
    const onStorage = () => setQuestions(loadQuestions());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // ── socket lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    socket.connect();

    const savedCode  = localStorage.getItem('trivia_host_room');
    const savedToken = localStorage.getItem('trivia_host_token');
    if (savedCode && savedToken) {
      socket.emit('host:reconnect', { roomCode: savedCode, hostToken: savedToken });
    } else {
      socket.emit('host:create_room');
    }

    socket.on('room:created', ({ roomCode: code, qrCode: qr, hostToken }) => {
      localStorage.setItem('trivia_host_room', code);
      localStorage.setItem('trivia_host_token', hostToken);
      setRoomCode(code);
      setQrCode(qr);
      setPhase('lobby');
    });

    socket.on('host:reconnected', ({ roomCode: code, qrCode: qr, phase: p, players: ps, questionCount }) => {
      setRoomCode(code);
      setQrCode(qr);
      setPlayers(ps ?? []);
      // Refresh questions count label
      if (questionCount) setQuestions((q) => (q.length ? q : loadQuestions()));
      setPhase(p === 'end' ? 'end' : 'lobby');   // safe fallback
    });

    socket.on('host:reconnect_failed', () => {
      localStorage.removeItem('trivia_host_room');
      localStorage.removeItem('trivia_host_token');
      socket.emit('host:create_room');
    });

    socket.on('room:player_joined', ({ players: ps }) => setPlayers(ps));
    socket.on('room:player_left',   ({ players: ps }) => setPlayers(ps));

    socket.on('game:started', () => { /* phase change comes with first game:question */ });

    socket.on('game:question', (payload) => {
      setCurrentQ(payload);
      setTimer(payload.timeLimit);
      setAnswerCount({ answered: 0, total: 0 });
      setRevealData(null);
      setPhase('question');
    });

    socket.on('game:timer_tick',  ({ remaining }) => setTimer(remaining));
    socket.on('game:answer_count', ({ answered, total }) => setAnswerCount({ answered, total }));

    socket.on('game:reveal', (data) => {
      setRevealData(data);
      setPhase('reveal');
    });

    socket.on('game:end', ({ leaderboard, winnerGifUrl }) => {
      setFinalLB(leaderboard);
      setWinnerGifUrl(winnerGifUrl ?? null);
      setPhase('end');
    });

    socket.on('error', ({ message }) => showToast(message));

    return () => {
      socket.off('room:created');
      socket.off('host:reconnected');
      socket.off('host:reconnect_failed');
      socket.off('room:player_joined');
      socket.off('room:player_left');
      socket.off('game:started');
      socket.off('game:question');
      socket.off('game:timer_tick');
      socket.off('game:answer_count');
      socket.off('game:reveal');
      socket.off('game:end');
      socket.off('error');
      socket.disconnect();
    };
  }, [showToast]);

  // ── actions ─────────────────────────────────────────────────────────────────

  const startGame = () => {
    const qs = loadQuestions();
    if (!qs.length) { showToast('Upload questions in Settings first'); return; }
    socket.emit('host:start_game', {
      roomCode,
      hostToken: localStorage.getItem('trivia_host_token'),
      questions: qs,
      timeLimit: loadTimeLimit(),
    });
  };

  const advance = () => {
    socket.emit('host:advance', {
      roomCode,
      hostToken: localStorage.getItem('trivia_host_token'),
    });
  };

  const resetGame = () => {
    localStorage.removeItem('trivia_host_room');
    localStorage.removeItem('trivia_host_token');
    window.location.reload();
  };

  // ── render ───────────────────────────────────────────────────────────────────

  if (phase === 'init') {
    return (
      <div className="screen-center">
        <div className="spinner" />
        <p>Setting up your room…</p>
      </div>
    );
  }

  if (phase === 'lobby') {
    const joinUrl = `${window.location.origin}/join/${roomCode}`;
    return (
      <div className="host-lobby">
        <div className="lobby-left">
          <div className="room-code-box">
            <div className="room-code-label">Join at {window.location.host}</div>
            <div className="room-code-value">{roomCode}</div>
            <div className="room-code-url">{joinUrl}</div>
          </div>
          {qrCode && <img src={qrCode} alt={`QR for ${joinUrl}`} className="qr-code" />}
        </div>

        <div className="lobby-right">
          <div>
            <div className="player-list-header">Players ({players.length} / 10)</div>
            <div className="player-chips">
              {players.map((p) => (
                <div key={p.id} className="player-chip">{p.nickname}</div>
              ))}
              {players.length === 0 && (
                <span style={{ color: 'var(--muted)', fontSize: '.9rem' }}>Waiting for players to join…</span>
              )}
            </div>
          </div>

          <div className="lobby-actions">
            <div className={`q-status${questions.length > 0 ? ' loaded' : ''}`}>
              {questions.length > 0
                ? `✓ ${questions.length} questions loaded`
                : 'No questions loaded'}
            </div>
            <Link to="/settings" className="btn btn-secondary">
              {questions.length > 0 ? 'Change Questions / Settings' : 'Upload Questions'}
            </Link>
            <button
              className="btn btn-primary"
              onClick={startGame}
              disabled={players.length === 0 || questions.length === 0}
            >
              Start Game
            </button>
          </div>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (phase === 'question' && currentQ) {
    const isLastQ = currentQ.questionIndex + 1 >= currentQ.totalQuestions;
    return (
      <div className="host-question">
        <div className="question-header">
          <span className="q-counter">
            Question {currentQ.questionIndex + 1} / {currentQ.totalQuestions}
          </span>
          <Timer seconds={timer} total={currentQ.timeLimit} />
          <span className="answer-tally">
            {answerCount.answered} / {answerCount.total || players.length} answered
          </span>
        </div>

        <h2 className="question-text">{currentQ.question}</h2>

        <GifDisplay url={currentQ.gifUrl} />

        <div className="answers-grid">
          {['a', 'b', 'c', 'd'].map((k) => (
            <div key={k} className={`answer-tile ${k}`}>
              <span className="answer-letter">{k.toUpperCase()}</span>
              <span>{currentQ.answers[k]}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary skip-btn" onClick={advance}>
            {isLastQ ? 'End Question' : 'Skip Timer'}
          </button>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (phase === 'reveal' && revealData && currentQ) {
    const { correct, distribution, leaderboard } = revealData;
    const total = Object.values(distribution).reduce((s, n) => s + n, 0);
    const isLastQ = currentQ.questionIndex + 1 >= currentQ.totalQuestions;

    return (
      <div className="host-reveal">
        <h2 className="question-text">{currentQ.question}</h2>

        <div className="correct-banner">
          Correct answer: <strong>{correct.toUpperCase()} — {currentQ.answers[correct]}</strong>
        </div>

        <div className="reveal-body">
          <BarChart
            distribution={distribution}
            correct={correct}
            total={total}
            answers={currentQ.answers}
          />
          <Leaderboard players={leaderboard} />
        </div>

        <div className="advance-row">
          <button className="btn btn-primary" onClick={advance}>
            {isLastQ ? 'See Final Results →' : 'Next Question →'}
          </button>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (phase === 'end') {
    return (
      <div className="host-end">
        <h1>Game Over!</h1>
        {winnerGifUrl && (
          <img src={winnerGifUrl} alt="celebration" className="winner-gif" />
        )}
        <Leaderboard players={finalLB} showAll />
        <button className="btn btn-secondary" onClick={resetGame}>
          Play Again
        </button>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return null;
}
