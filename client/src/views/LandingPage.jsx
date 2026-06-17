import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function LandingPage() {
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  const join = (e) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length === 4) navigate(`/join/${trimmed}`);
  };

  return (
    <div className="landing">
      <div>
        <h1>Trivia!</h1>
        <p>The real-time multiplayer quiz game</p>
      </div>

      <form className="join-form" onSubmit={join}>
        <input
          type="text"
          placeholder="Enter room code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
          maxLength={4}
          autoCapitalize="characters"
          autoComplete="off"
          style={{ textAlign: 'center', fontSize: '1.8rem', letterSpacing: '.2em', fontWeight: 900 }}
        />
        <button type="submit" className="btn btn-primary" disabled={code.trim().length !== 4}>
          Join Game
        </button>
      </form>

      <div className="landing-actions">
        <Link to="/host" className="btn btn-secondary">Host a Game</Link>
      </div>
    </div>
  );
}
