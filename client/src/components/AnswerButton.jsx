const LABEL = { a: 'A', b: 'B', c: 'C', d: 'D' };

/**
 * props:
 *   letter     'a'|'b'|'c'|'d'
 *   text       string
 *   selected   bool
 *   locked     bool   — another answer was selected (dim this one)
 *   disabled   bool
 *   onClick    fn
 */
export default function AnswerButton({ letter, text, selected, locked, disabled, onClick }) {
  const cls = [
    'answer-btn',
    letter,
    selected ? 'selected' : '',
    locked   ? 'locked'   : '',
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} onClick={onClick} disabled={disabled}>
      <span className="btn-letter">{LABEL[letter]}</span>
      <span className="btn-text">{text}</span>
    </button>
  );
}
