// Inclusive observances that re-theme the logo's LED bar and fader-cap line.
// Pure and data-driven: date (player's LOCAL calendar) -> observance. Colours
// only where a widely recognised flag/palette exists; others get a neutral
// treatment (label + tooltip + a cream lamp chase) rather than an invented
// palette. Dates are US observances; regions can be added later (e.g. the UK
// and Ireland mark Black History Month in October).

export interface Observance {
  id: string;
  label: string;
  // [month (1-12), day] inclusive; a range may wrap the year end.
  from: [number, number];
  to: [number, number];
  colors?: string[];
  cap?: string;
  href?: string;
  // Only / never in these regions (navigator.language region, e.g. 'GB').
  regions?: string[];
  notRegions?: string[];
}

// A neutral "commemorative" gold for observances without one widely
// recognised flag — the label does the work, no invented palette.
const GOLD = ['#a87d22', '#d4a33a', '#e8c66a', '#d4a33a', '#a87d22'];
const UK = ['GB', 'IE'];

export const OBSERVANCES: Observance[] = [
  {
    id: 'bhm',
    label: 'Celebrating Black History Month',
    from: [2, 1],
    to: [2, 29],
    colors: ['#e31b23', '#111111', '#00853f', '#fcd116'],
    cap: '#fcd116',
    href: 'https://www.blackhistorymonth.gov',
    notRegions: UK,
  },
  {
    // The UK and Ireland mark Black History Month in October.
    id: 'bhm-uk',
    label: 'Celebrating Black History Month',
    from: [10, 1],
    to: [10, 31],
    colors: ['#e31b23', '#111111', '#00853f', '#fcd116'],
    cap: '#fcd116',
    regions: UK,
  },
  {
    id: 'whm',
    label: 'Celebrating Women’s History Month',
    from: [3, 1],
    to: [3, 31],
    colors: ['#5b2a86', '#f4f1ea', '#d4a017'],
    cap: '#d4a017',
    href: 'https://www.womenshistorymonth.gov',
  },
  {
    id: 'aanhpi',
    colors: GOLD,
    cap: '#d4a33a',
    label:
      'Celebrating Asian American, Native Hawaiian & Pacific Islander Heritage Month',
    from: [5, 1],
    to: [5, 31],
    href: 'https://asianpacificheritage.gov',
  },
  {
    id: 'pride',
    label: 'Celebrating Pride Month',
    from: [6, 1],
    to: [6, 30],
    colors: ['#e40303', '#ff8c00', '#ffed00', '#008026', '#24408e', '#732982'],
    cap: '#ff8c00',
  },
  {
    id: 'juneteenth',
    label: 'Celebrating Juneteenth',
    from: [6, 19],
    to: [6, 19],
    colors: ['#bf0a30', '#f2f2f2', '#002868', '#f2f2f2', '#bf0a30'],
    cap: '#bf0a30',
  },
  {
    id: 'disability',
    label: 'Celebrating Disability Pride Month',
    from: [7, 1],
    to: [7, 31],
    colors: ['#cf7280', '#eedf76', '#e8e8e8', '#7bc2e0', '#3aad7d'],
    cap: '#eedf76',
  },
  {
    id: 'hhm',
    colors: GOLD,
    cap: '#d4a33a',
    label: 'Celebrating Hispanic & Latine Heritage Month',
    from: [9, 15],
    to: [10, 15],
    href: 'https://www.hispanicheritagemonth.gov',
  },
  {
    id: 'nahm',
    colors: GOLD,
    cap: '#d4a33a',
    label: 'Celebrating Native American Heritage Month',
    from: [11, 1],
    to: [11, 30],
    href: 'https://www.nativeamericanheritagemonth.gov',
  },
];

const key = (m: number, d: number) => m * 100 + d;

function inRange(o: Observance, k: number): boolean {
  const a = key(...o.from);
  const b = key(...o.to);
  return a <= b ? k >= a && k <= b : k >= a || k <= b;
}

// Length in days (in a leap year), so the most specific observance wins.
function span(o: Observance): number {
  const y = 2000;
  const a = Date.UTC(y, o.from[0] - 1, o.from[1]);
  let b = Date.UTC(y, o.to[0] - 1, o.to[1]);
  if (b < a) b += 366 * 864e5;
  return b - a;
}

// The observance for a date. Overlaps resolve to the shortest (Juneteenth wins
// over Pride on June 19); ties go to table order. `override` comes from
// ?theme=<id> for previews; 'none' turns themes off.
export function observanceFor(
  date: Date,
  override?: string | null,
  region = '',
  table: Observance[] = OBSERVANCES
): Observance | null {
  if (override === 'none') return null;
  if (override) return table.find((o) => o.id === override) ?? null;
  const k = key(date.getMonth() + 1, date.getDate());
  return (
    table
      .filter(
        (o) =>
          inRange(o, k) &&
          (!o.regions || o.regions.includes(region)) &&
          !o.notRegions?.includes(region)
      )
      .sort((x, y) => span(x) - span(y))[0] ?? null
  );
}

// The player's region from their language setting ("en-GB" -> "GB").
export function userRegion(): string {
  try {
    return (navigator.language.split('-')[1] ?? '').toUpperCase();
  } catch {
    return '';
  }
}
