import { useState } from 'react';

export default function GifDisplay({ url }) {
  const [error, setError] = useState(false);

  if (!url || error) return null;

  return (
    <div className="gif-container">
      <img src={url} alt="question gif" onError={() => setError(true)} loading="lazy" />
    </div>
  );
}
