// Tiny canvas waveform rendered from a piece's precomputed peaks. Bars use the
// piece's identity `color` when given (so each clip is visually distinct and a
// move is obvious); otherwise they fall back to the inherited CSS `color`.
//
// When `onSeek` is provided the waveform is scrubbable: click/tap to play from
// that point, and a playhead (driven by `getClipProgress`) tracks playback.

import { useEffect, useRef } from 'react';
import type { MouseEvent } from 'react';

interface WaveformProps {
  peaks: number[];
  active?: boolean;
  color?: string;
  onSeek?: (fraction: number) => void;
  getClipProgress?: (pieceId: string) => number | null;
  pieceId: string;
}

export default function Waveform({
  peaks,
  active = false,
  color,
  onSeek,
  getClipProgress,
  pieceId,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const headRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color || getComputedStyle(canvas).color || '#888';

    const n = peaks.length;
    const gap = 1.5;
    const barW = Math.max(1, w / n - gap);
    const mid = h / 2;

    peaks.forEach((p, i) => {
      const barH = Math.max(2, p * (h * 0.92));
      const x = i * (w / n);
      ctx.globalAlpha = active ? 1 : 0.78;
      ctx.fillRect(x, mid - barH / 2, barW, barH);
    });
  }, [peaks, active, color]);

  // Drive the playhead from playback time without re-rendering React each frame.
  useEffect(() => {
    const head = headRef.current;
    if (!head || !getClipProgress) return undefined;
    if (!active) {
      head.style.opacity = '0';
      return undefined;
    }
    let raf = 0;
    const tick = () => {
      const p = getClipProgress(pieceId);
      if (p == null) {
        head.style.opacity = '0';
      } else {
        head.style.opacity = '1';
        head.style.left = `${p * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, getClipProgress, pieceId]);

  function handleSeek(event: MouseEvent<HTMLButtonElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    // Keyboard activation reports clientX 0; clamping makes that play from start.
    const fraction = (event.clientX - rect.left) / rect.width;
    onSeek?.(Math.min(1, Math.max(0, fraction)));
  }

  if (!onSeek) {
    return <canvas ref={canvasRef} className="waveform" />;
  }

  return (
    <button
      type="button"
      className="waveform-seek"
      onClick={handleSeek}
      aria-label="Scrub clip — click to play from here"
    >
      <canvas ref={canvasRef} className="waveform" />
      <span ref={headRef} className="wave-playhead" aria-hidden="true" />
    </button>
  );
}
