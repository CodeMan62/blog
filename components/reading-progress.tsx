"use client";

import { useEffect, useState } from "react";

/** Thin gradient bar at the top showing reading progress. */
export default function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const scrolled = window.scrollY || doc.scrollTop || 0;
      setProgress(max > 0 ? Math.min(scrolled / max, 1) : 0);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className="progress-bar" role="progressbar" aria-hidden="true">
      <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
    </div>
  );
}