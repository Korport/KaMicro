const MEDAL = ['gold', 'silver', 'bronze'];

export default function Leaderboard({ players = [], showAll = false }) {
  const list = showAll ? players : players.slice(0, 5);

  return (
    <div className="leaderboard">
      <div className="leaderboard-title">Leaderboard</div>
      {list.map((p, i) => (
        <div key={p.playerId ?? i} className="lb-row" style={{ '--i': i }}>
          <div className={`lb-rank ${MEDAL[i] ?? ''}`}>{p.rank}</div>
          <span className="lb-nickname">{p.nickname}</span>
          {p.delta !== undefined && p.delta > 0 && (
            <span className="lb-delta">+{p.delta}</span>
          )}
          <span className="lb-score">{p.score.toLocaleString()}</span>
        </div>
      ))}
      {list.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: '.9rem', padding: '.5rem 0' }}>
          No scores yet
        </div>
      )}
    </div>
  );
}
