import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import socket from '../socket.js';
import AnswerButton from '../components/AnswerButton.jsx';

// ─── helpers ─────────────────────────────────────────────────────────────────

function loadSavedPlayer(roomCode) {
  try {
    const raw = localStorage.getItem(`trivia_player_${roomCode}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePlayer(roomCode, playerId, nickname) {
  localStorage.setItem(`trivia_player_${roomCode}`, JSON.stringify({ playerId, nickname }));
}

// ─── component ────────────────────────────────────────────────────────────────

export default function PlayerView() {
  const { roomCode } = useParams();

  const [phase, setPhase] = useState('join');   // join | lobby | question | locked | reveal | end
  const [nickname, setNickname] = useState('');
  const [playerId, setPlayerId] = useState(null);
  const [displayName, setDisplayName] = useState('');

  const [currentQ, setCurrentQ] = useState(null);   // game:question payload
  const [timer, setTimer] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);

  const [result, setResult]   = useState(null);   // { isCorrect, delta, score }
  const [leaderboard, setLB]  = useState([]);
  const [finalLB, setFinalLB] = useState([]);

  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── socket lifecycle ────────────────────────────────────────────────────────
  useEffect(() => {
    socket.connect();

    // Attempt reconnect if we already joined this room
    const saved = loadSavedPlayer(roomCode);
    if (saved) {
      setDisplayName(saved.nickname);
      socket.emit('player:join', { roomCode, nickname: saved.nickname, playerId: saved.playerId });
    }

    socket.on('player:joined', ({ playerId: pid, nickname: nick, players, phase: p }) => {
      setPlayerId(pid);
      setDisplayName(nick);
      savePlayer(roomCode, pid, nick);
      setPhase(p === 'question' ? 'lobby' : 'lobby');  // wait for game:question to switch
    });

    socket.on('game:started', () => {
      setPhase('lobby');  // waiting for first question
    });

    socket.on('game:question', (payload) => {
      setCurrentQ(payload);
      setTimer(payload.timeLimit);
      setSelectedAnswer(null);
      setResult(null);
      setPhase('question');
    });

    socket.on('game:timer_tick', ({ remaining }) => setTimer(remaining));

    socket.on('player:answer_locked', () => {
      setPhase('locked');
    });

    socket.on('player:result', (r) => {
      setResult(r);
      setPhase('reveal');
    });

    socket.on('game:reveal', ({ leaderboard: lb }) => {
      setLB(lb);
    });

    socket.on('game:end', ({ leaderboard: lb }) => {
      setFinalLB(lb);
      setPhase('end');
    });

    socket.on('error', ({ message }) => showToast(message));

    return () => {
      socket.off('player:joined');
      socket.off('game:started');
      socket.off('game:question');
      socket.off('game:timer_tick');
      socket.off('player:answer_locked');
      socket.off('player:result');
      socket.off('game:reveal');
      socket.off('game:end');
      socket.off('error');
      socket.disconnect();
    };
  }, [roomCode, showToast]);

  // ── actions ─────────────────────────────────────────────────────────────────

  const joinRoom = (e) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) return;
    setDisplayName(name);
    socket.emit('player:join', { roomCode, nickname: name, playerId: null });
  };

  const submitAnswer = (answer) => {
    if (phase !== 'question') return;
    setSelectedAnswer(answer);
    socket.emit('player:answer', { answer });
  };

  // ── rank lookup ─────────────────────────────────────────────────────────────

  const myRank = useCallback((lb) => {
    return lb.find((p) => p.playerId === playerId)?.rank ?? null;
  }, [playerId]);

  // ── render ───────────────────────────────────────────────────────────────────

  if (phase === 'join') {
    return (
      <div className="player-screen screen-center">
        <form className="join-form" onSubmit={joinRoom}>
          <h2>Join Game</h2>
          <div className="room-badge">{roomCode}</div>
          <input
            type="text"
            placeholder="Your nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value.slice(0, 20))}
            autoFocus
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" disabled={!nickname.trim()}>
            Join →
          </button>
        </form>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (phase === 'lobby') {
    return (
      <div className="player-screen screen-center">
        <div className="player-lobby">
          <div className="nickname-badge">{displayName}</div>
          <p className="waiting-text">
            Waiting for the host to start…
            <span className="waiting-dots">
              <span>.</span><span>.</span><span>.</span>
            </span>
          </p>
          <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>Room: <strong>{roomCode}</strong></div>
        </div>
      </div>
    );
  }

  if (phase === 'question' && currentQ) {
    return (
      <div className="player-screen">
        <div className="player-question-header">
          <span className="player-q-counter">
            {currentQ.questionIndex + 1}/{currentQ.totalQuestions}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: '.9rem' }}>⏱ {timer}s</span>
        </div>
        <div className="player-q-text">{currentQ.question}</div>
        <div className="answer-buttons">
          {['a', 'b', 'c', 'd'].map((k) => (
            <AnswerButton
              key={k}
              letter={k}
              text={currentQ.answers[k]}
              selected={selectedAnswer === k}
              locked={false}
              disabled={false}
              onClick={() => submitAnswer(k)}
            />
          ))}
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (phase === 'locked' && currentQ) {
    return (
      <div className="player-screen">
        <div className="player-question-header">
          <span className="player-q-counter">
            {currentQ.questionIndex + 1}/{currentQ.totalQuestions}
          </span>
          <span style={{ color: 'var(--muted)', fontSize: '.9rem' }}>⏱ {timer}s</span>
        </div>
        <div className="locked-screen">
          <div className="locked-icon">🔒</div>
          <div className="locked-label">Answer locked in!</div>
          <div className="locked-answer">
            You chose <strong>{selectedAnswer?.toUpperCase()}</strong>
            {currentQ && ` — ${currentQ.answers[selectedAnswer]}`}
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '.85rem' }}>
            Waiting for other players…
          </div>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (phase === 'reveal' && result) {
    const rank = myRank(leaderboard);
    return (
      <div className="player-screen screen-center">
        <div className="player-result">
          <div className="result-icon">{result.isCorrect ? '✅' : '❌'}</div>
          <div className="result-label" style={{ color: result.isCorrect ? '#4caf50' : 'var(--a)' }}>
            {result.isCorrect ? 'Correct!' : 'Wrong!'}
          </div>
          {result.isCorrect && (
            <div className="result-delta">+{result.delta} pts</div>
          )}
          <div className="result-score">Total: {result.score.toLocaleString()} pts</div>
          {rank && <div className="result-rank">Rank #{rank}</div>}
          <div style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: '.5rem' }}>
            Waiting for next question…
          </div>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  if (phase === 'end') {
    const rank = myRank(finalLB);
    const myEntry = finalLB.find((p) => p.playerId === playerId);
    const podiumEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '🎉';
    return (
      <div className="player-screen screen-center">
        <div className="player-end">
          <div className="final-rank">{podiumEmoji}</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{displayName}</div>
          <div className="final-label">Final rank</div>
          <div className="final-rank" style={{ fontSize: '3rem' }}>#{rank ?? '?'}</div>
          <div className="final-score">{myEntry?.score?.toLocaleString() ?? 0} pts</div>
          <div style={{ color: 'var(--muted)', fontSize: '.85rem', marginTop: '1rem' }}>
            Thanks for playing!
          </div>
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  return (
    <div className="screen-center">
      <div className="spinner" />
    </div>
  );
}
