const LABELS = { a: 'A', b: 'B', c: 'C', d: 'D' };

export default function BarChart({ distribution, correct, total, answers }) {
  return (
    <div className="bar-chart">
      {['a', 'b', 'c', 'd'].map((key) => {
        const count = distribution[key] ?? 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={key} className="bar-row">
            <span className="bar-row-label">{LABELS[key]}</span>
            <div className="bar-track">
              <div
                className={`bar-fill ${key}${key === correct ? ' correct' : ''}`}
                style={{ width: `${pct}%` }}
              >
                {pct > 8 ? `${pct}%` : null}
              </div>
            </div>
            <span className="bar-count">{count}</span>
          </div>
        );
      })}
      {answers && (
        <div style={{ marginTop: '.5rem', fontSize: '.8rem', color: 'var(--muted)' }}>
          {['a','b','c','d'].map((k) => (
            <div key={k} style={{ display: 'flex', gap: '.5rem', marginBottom: '.15rem' }}>
              <strong style={{ color: `var(--${k})` }}>{LABELS[k]}:</strong>
              <span>{answers[k]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
