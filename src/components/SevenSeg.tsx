// A 7-segment display (think 80s console clock) in inline SVG. Unlit "ghost"
// segments stay faintly visible, like the real thing.

const SEGS: Record<string, string> = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcdfg',
  '-': 'g',
  ' ': '',
};

// Segment polygons in a 12×20 cell.
const SHAPES: Record<string, string> = {
  a: '2,1 10,1 9,2.6 3,2.6',
  b: '10.4,1.6 10.4,9.4 8.8,8.6 8.8,2.8',
  c: '10.4,10.6 10.4,18.4 8.8,17.2 8.8,11.4',
  d: '2,19 10,19 9,17.4 3,17.4',
  e: '1.6,10.6 1.6,18.4 3.2,17.2 3.2,11.4',
  f: '1.6,1.6 1.6,9.4 3.2,8.6 3.2,2.8',
  g: '2.4,10 3.4,9.2 8.6,9.2 9.6,10 8.6,10.8 3.4,10.8',
};

export default function SevenSeg({
  value,
  label,
}: {
  value: string;
  label: string;
}) {
  let x = 0;
  const cells = [...value].map((ch, i) => {
    if (ch === ':') {
      const cx = x + 2.5;
      x += 5;
      return (
        <g key={i} className="seg-on">
          <rect x={cx - 1} y="5.5" width="2" height="2" />
          <rect x={cx - 1} y="12.5" width="2" height="2" />
        </g>
      );
    }
    const on = SEGS[ch] ?? '';
    const ox = x;
    x += 13;
    return (
      <g key={i} transform={`translate(${ox} 0) skewX(-6)`}>
        {Object.entries(SHAPES).map(([s, pts]) => (
          <polygon
            key={s}
            points={pts}
            className={on.includes(s) ? 'seg-on' : 'seg-off'}
          />
        ))}
      </g>
    );
  });
  return (
    <span className="sevenseg" role="timer" aria-label={label}>
      <svg viewBox={`-1 0 ${x + 1} 20`} aria-hidden="true">
        {cells}
      </svg>
    </span>
  );
}
