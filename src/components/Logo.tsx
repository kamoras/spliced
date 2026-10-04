// The console nameplate: SPLI ▮ CED, where the "|" is a fader slot with a
// cap, and a thin LED bar underneath doubles as a master meter. During
// inclusive observances the LED bar and cap line take on that observance's
// colours — the letters never change, so the mark stays legible.

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { subscribeLevel, prefersReducedMotion } from '../audio/meter.js';
import type { Observance } from '../theme/observances.js';

// A win snaps the fader cap to the top (`spliced`); a new game pulls it
// back down.
export default function Logo({
  obs,
  spliced = false,
}: {
  obs: Observance | null;
  spliced?: boolean;
}) {
  const ledsRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const el = ledsRef.current;
    if (!el || prefersReducedMotion()) return undefined;
    return subscribeLevel((v) => el.style.setProperty('--vu', v.toFixed(3)));
  }, []);

  // Always 7 LEDs (so the header never shifts); themes cycle their colours.
  const colors = Array.from({ length: 7 }, (_, i) =>
    obs?.colors?.length ? obs.colors[i % obs.colors.length] : null
  );
  return (
    <h1
      className={`logo${spliced ? ' is-spliced' : ''}${obs ? ' has-obs' : ''}`}
      aria-label={obs ? `Spliced: ${obs.label}` : 'Spliced'}
      title={obs?.label}
      data-obs={obs?.id}
      style={
        obs?.cap ? ({ '--cap-line': obs.cap } as CSSProperties) : undefined
      }
    >
      <span className="logo-plate" aria-hidden="true">
        <span>SPLI</span>
        <span className="logo-slot">
          <span className="logo-cap" />
        </span>
        <span>CED</span>
      </span>
      <span className="logo-leds" ref={ledsRef} aria-hidden="true">
        {colors.map((c, i) => (
          <i
            key={i}
            style={{ '--c': c ?? undefined, '--i': i } as CSSProperties}
          />
        ))}
      </span>
    </h1>
  );
}
