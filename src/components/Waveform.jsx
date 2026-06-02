// Tiny canvas waveform rendered from a piece's precomputed peaks.

import { useEffect, useRef } from 'react';

export default function Waveform({ peaks, color = '#7af7c0', active = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;

    const n = peaks.length;
    const gap = 1.5;
    const barW = Math.max(1, w / n - gap);
    const mid = h / 2;

    peaks.forEach((p, i) => {
      const barH = Math.max(2, p * (h * 0.92));
      const x = i * (w / n);
      ctx.globalAlpha = active ? 1 : 0.85;
      ctx.fillRect(x, mid - barH / 2, barW, barH);
    });
  }, [peaks, color, active]);

  return <canvas ref={canvasRef} className="waveform" />;
}
