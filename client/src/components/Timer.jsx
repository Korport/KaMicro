export default function Timer({ seconds, total }) {
  const radius = 36;
  const circ = 2 * Math.PI * radius;
  const progress = total > 0 ? Math.max(0, seconds / total) : 0;
  const offset = circ * (1 - progress);
  const urgent = seconds <= 5;

  const stroke = urgent ? 'var(--a)' : seconds <= 10 ? 'var(--c)' : 'var(--accent)';

  return (
    <div className={`timer-ring${urgent ? ' urgent' : ''}`}>
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="var(--surface2)" strokeWidth="6" />
        <circle
          cx="44" cy="44" r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
        />
      </svg>
      <span className="timer-label">{seconds}</span>
    </div>
  );
}
