import React, { useState, useEffect } from 'react';
import { AUTH_BACKGROUNDS } from '../assets/auth-backgrounds/index.js';
import './AuthBackground.css';

const ROTATE_MS = 2 * 60 * 1000; // 2 minutes per image, as requested — slow and ambient, not a slideshow
const CROSSFADE_MS = 3000;

/*
  Wraps the ENTIRE pre-app auth experience — Login (new or returning
  user) all the way through Setup questions for new users — as one
  continuous background that keeps rotating the whole time and only
  disappears once the user actually lands in the main app. It does
  NOT reset or restart when moving between Login -> Setup steps,
  because this component is mounted once, above all of them, in
  App.jsx — not remounted per screen.
*/
export default function AuthBackground({ children }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (AUTH_BACKGROUNDS.length < 2) return; // nothing to rotate to
    const id = setInterval(() => {
      setIndex(i => (i + 1) % AUTH_BACKGROUNDS.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="auth-bg-wrap">
      {AUTH_BACKGROUNDS.map((src, i) => (
        <div
          key={src}
          className="auth-bg-layer"
          style={{
            backgroundImage: `url(${src})`,
            opacity: i === index ? 1 : 0,
            transitionDuration: `${CROSSFADE_MS}ms`,
          }}
        />
      ))}
      <div className="auth-bg-shade" />
      <div className="auth-bg-content">{children}</div>
    </div>
  );
}
