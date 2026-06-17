import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';

const REQUIRED_COLS = ['question', 'answer_a', 'answer_b', 'answer_c', 'answer_d', 'correct', 'giphy_keyword'];
const VALID_CORRECT = new Set(['a', 'b', 'c', 'd']);

function validateRows(rows) {
  const errors = [];
  const valid = [];
  rows.forEach((row, i) => {
    const rowNum = i + 2; // +1 for header, +1 for 1-based
    const missing = REQUIRED_COLS.filter((c) => !row[c]?.toString().trim());
    if (missing.length) {
      errors.push(`Row ${rowNum}: missing columns: ${missing.join(', ')}`);
      return;
    }
    const correct = row.correct.toString().trim().toLowerCase();
    if (!VALID_CORRECT.has(correct)) {
      errors.push(`Row ${rowNum}: "correct" must be a, b, c, or d — got "${row.correct}"`);
      return;
    }
    valid.push({
      question:      row.question.trim(),
      answer_a:      row.answer_a.trim(),
      answer_b:      row.answer_b.trim(),
      answer_c:      row.answer_c.trim(),
      answer_d:      row.answer_d.trim(),
      correct,
      giphy_keyword: row.giphy_keyword?.trim() || '',
    });
  });
  return { valid, errors };
}

export default function SettingsPage() {
  const [questions, setQuestions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('trivia_questions') ?? '[]'); }
    catch { return []; }
  });
  const [errors, setErrors] = useState([]);
  const [timeLimit, setTimeLimit] = useState(() => Number(localStorage.getItem('trivia_time_limit') ?? 20));
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const navigate = useNavigate();

  const processFile = useCallback((file) => {
    if (!file) return;
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const { valid, errors: errs } = validateRows(data);
        setQuestions(valid);
        setErrors(errs);
      },
      error: (err) => setErrors([err.message]),
    });
  }, []);

  const onFileChange = (e) => processFile(e.target.files[0]);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    processFile(e.dataTransfer.files[0]);
  };

  const save = () => {
    localStorage.setItem('trivia_questions', JSON.stringify(questions));
    localStorage.setItem('trivia_time_limit', String(timeLimit));
    navigate('/host');
  };

  return (
    <div className="settings-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link to="/host" className="btn btn-secondary" style={{ padding: '.4rem .9rem', fontSize: '.85rem' }}>
          ← Back
        </Link>
        <h1>Settings</h1>
      </div>

      {/* Timer */}
      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: '.75rem' }}>Time per question</div>
        <div className="time-limit-row">
          <label>5s</label>
          <input
            type="range" min="5" max="60" step="5"
            value={timeLimit}
            onChange={(e) => setTimeLimit(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <label>60s</label>
          <span className="tl-value">{timeLimit}s</span>
        </div>
      </div>

      {/* Upload zone */}
      <div
        className={`upload-zone${dragOver ? ' drag-over' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()}
      >
        <div className="upload-icon">📂</div>
        <div style={{ fontWeight: 700 }}>Drop a CSV file here or click to browse</div>
        <div className="upload-hint">
          Required columns: question, answer_a, answer_b, answer_c, answer_d, correct (a/b/c/d), giphy_keyword
        </div>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFileChange} />
      </div>

      {/* Stats */}
      {questions.length > 0 && (
        <div className="csv-stats">
          <div className="csv-stat">
            <div className="csv-stat-value">{questions.length}</div>
            <div className="csv-stat-label">Valid questions</div>
          </div>
          <div className="csv-stat">
            <div className="csv-stat-value" style={{ color: errors.length ? 'var(--a)' : '#4caf50' }}>
              {errors.length}
            </div>
            <div className="csv-stat-label">Errors</div>
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="error-list">
          {errors.map((e, i) => <div key={i} className="error-item">⚠ {e}</div>)}
        </div>
      )}

      {/* Preview */}
      {questions.length > 0 && (
        <div className="card" style={{ fontSize: '.85rem' }}>
          <div style={{ fontWeight: 700, marginBottom: '.5rem' }}>Preview (first 3)</div>
          {questions.slice(0, 3).map((q, i) => (
            <div key={i} style={{ marginBottom: '.75rem', paddingBottom: '.75rem', borderBottom: '1px solid #2a2a4a' }}>
              <div style={{ fontWeight: 700 }}>{i + 1}. {q.question}</div>
              <div style={{ color: 'var(--muted)', marginTop: '.25rem' }}>
                {['a','b','c','d'].map((k) => (
                  <span key={k} style={{ marginRight: '.75rem', color: k === q.correct ? '#4caf50' : 'var(--muted)' }}>
                    {k.toUpperCase()}: {q[`answer_${k}`]}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="settings-actions">
        <button
          className="btn btn-primary"
          onClick={save}
          disabled={questions.length === 0}
        >
          Save & Return to Lobby ({questions.length} questions)
        </button>
        {questions.length > 0 && (
          <button className="btn btn-secondary" onClick={() => { setQuestions([]); setErrors([]); }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
