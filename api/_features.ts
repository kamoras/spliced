// Observance-themed dailies. While an observance runs (the same windows the
// client themes itself for, see src/theme/observances.ts), each day's mix
// includes at least one song from that observance's pool, as long as the
// pool has songs left this epoch. The puzzle stays one puzzle for everyone:
// the pools only steer the deterministic schedule.
//
// Pools are deliberately conservative: artists whose place in the
// observance is beyond question, plus a genre where one maps cleanly. An
// artist is matched on the full credited name, so "Queen" never matches
// "Josiah Queen".
//
// Files prefixed with "_" are NOT treated as routes by Vercel.

import type { CatalogEntry } from './_types.js';

export interface Feature {
  id: string;
  // [month, day] inclusive, UTC.
  from: [number, number];
  to: [number, number];
  artists?: string[];
  genres?: string[];
  titles?: string[];
}

const BLACK_ARTISTS = [
  'Stevie Wonder',
  'Aretha Franklin',
  'Marvin Gaye',
  'Marvin Gaye & Tammi Terrell',
  'Beyoncé',
  'Nina Simone',
  'Ray Charles',
  'Tina Turner',
  'Whitney Houston',
  'Michael Jackson',
  'The Jackson 5',
  'Prince & The Revolution',
  'James Brown',
  'Bob Marley & The Wailers',
  'Bob Marley',
  'Kendrick Lamar',
  'Outkast',
  'TLC',
  'Alicia Keys',
  'Rihanna',
  'Kanye West',
  'Earth, Wind & Fire',
  'The Temptations',
  'Otis Redding',
  'Sam Cooke',
  'Chuck Berry',
  'Ben E. King',
  'Fugees',
  'Coolio',
  '2Pac',
  'The Notorious B.I.G.',
  'Usher',
  '50 Cent',
  'Lil Nas X',
  'Donna Summer',
  'Gloria Gaynor',
  'CHIC',
  'Blackstreet',
  'Pharrell Williams',
  'Diana Ross',
  'Lauryn Hill',
  'Mary J. Blige',
  'Luther Vandross',
  'Al Green',
  'Nas',
  'Jay-Z',
  'Missy Elliott',
  'Janet Jackson',
  'Lionel Richie',
  'Bill Withers',
  'Peabo Bryson',
];

const WOMEN_ARTISTS = [
  'Aretha Franklin',
  'Whitney Houston',
  'Madonna',
  'Beyoncé',
  'Taylor Swift',
  'Adele',
  'Lady Gaga',
  'Dolly Parton',
  'Carole King',
  'Tina Turner',
  'Nina Simone',
  'Cyndi Lauper',
  'Billie Eilish',
  'Olivia Rodrigo',
  'Rihanna',
  'Alicia Keys',
  'Shakira',
  'Selena',
  'Donna Summer',
  'Gloria Gaynor',
  'Katy Perry',
  'Britney Spears',
  'Kelly Clarkson',
  'Spice Girls',
  'TLC',
  'The Cranberries',
  'Celia Cruz',
  'KAROL G',
  'Chappell Roan',
  'k.d. lang',
  'Indigo Girls',
  'Gloria Estefan',
  'Gloria Estefan & Miami Sound Machine',
  'Jennifer Lopez',
  'Janet Jackson',
  'Mary J. Blige',
  'Missy Elliott',
  'Lauryn Hill',
  'Diana Ross',
  'Fleetwood Mac',
  'Blondie',
  'Joni Mitchell',
  'Stevie Nicks',
  'Amy Winehouse',
  'Sia',
  'Dua Lipa',
  'Miley Cyrus',
  'Ariana Grande',
  'Sabrina Carpenter',
  'Lorde',
  'Norah Jones',
  'Etta James',
  'Patsy Cline',
  'Shania Twain',
];

export const FEATURES: Feature[] = [
  {
    id: 'bhm',
    from: [2, 1],
    to: [2, 29],
    artists: BLACK_ARTISTS,
  },
  {
    id: 'whm',
    from: [3, 1],
    to: [3, 31],
    artists: WOMEN_ARTISTS,
  },
  {
    id: 'aanhpi',
    from: [5, 1],
    to: [5, 31],
    artists: [
      "Israel Kamakawiwo'ole",
      'BTS',
      'Jung Kook & BTS',
      'PSY',
      'Bruno Mars',
      'Olivia Rodrigo',
      'Keola and Kapono Beamer',
      'H.E.R.',
      'Mitski',
    ],
    genres: ['K-pop'],
  },
  {
    id: 'pride',
    from: [6, 1],
    to: [6, 30],
    artists: [
      'Elton John',
      'Queen',
      'Queen & David Bowie',
      'Lady Gaga',
      'Lil Nas X',
      'Chappell Roan',
      'k.d. lang',
      'Indigo Girls',
      'Disclosure & Sam Smith',
      'Sam Smith',
      'George Michael',
      'Wham!',
      'Frankie Goes To Hollywood',
      'Pet Shop Boys',
      'Culture Club',
      'Tegan and Sara',
      'Troye Sivan',
      'Frank Ocean',
      'Janelle Monáe',
      'Sylvester',
      'Bronski Beat',
      'Erasure',
    ],
    titles: [
      'I Will Survive',
      'Dancing Queen',
      'Born This Way',
      'True Colors',
      'Vogue',
      'I Want to Break Free',
      "I'm Coming Out",
      'Believe',
    ],
  },
  {
    id: 'juneteenth',
    from: [6, 19],
    to: [6, 19],
    artists: BLACK_ARTISTS,
  },
  {
    id: 'disability',
    from: [7, 1],
    to: [7, 31],
    artists: [
      'Stevie Wonder',
      'Ray Charles',
      'Def Leppard',
      'Teddy Pendergrass',
    ],
  },
  {
    id: 'hhm',
    from: [9, 15],
    to: [10, 15],
    genres: ['Latin'],
    artists: [
      'Selena',
      'Shakira',
      'Santana',
      'Ricky Martin',
      'Gloria Estefan',
      'Gloria Estefan & Miami Sound Machine',
      'Bad Bunny',
      'Luis Fonsi & Daddy Yankee',
      'Daddy Yankee',
      'Enrique Iglesias',
      'Marc Anthony',
      'Jennifer Lopez',
      'Celia Cruz',
      'KAROL G',
      'Elvis Crespo',
      'Carlos Gardel',
      'Camila Cabello',
      'Los Lobos',
      'Carlos Santana',
      'Linda Ronstadt',
    ],
  },
  {
    id: 'nahm',
    from: [11, 1],
    to: [11, 30],
    artists: ['Redbone', 'Link Wray', 'Buffy Sainte-Marie', 'Robbie Robertson'],
  },
];

const key = (m: number, d: number) => m * 100 + d;

// The feature active on a UTC date, if any (shortest window wins).
export function featureFor(
  date: Date,
  table: Feature[] = FEATURES
): Feature | null {
  const k = key(date.getUTCMonth() + 1, date.getUTCDate());
  const active = table.filter((f) => {
    const a = key(...f.from);
    const b = key(...f.to);
    return a <= b ? k >= a && k <= b : k >= a || k <= b;
  });
  if (!active.length) return null;
  const days = (f: Feature) => key(...f.to) - key(...f.from);
  return active.sort((x, y) => days(x) - days(y))[0];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// Does a song belong to a feature's pool?
export function inFeature(song: CatalogEntry, f: Feature): boolean {
  if (f.genres?.includes(song.genre ?? '')) return true;
  const artist = norm(song.artist);
  if (f.artists?.some((a) => norm(a) === artist)) return true;
  const title = norm(song.title.replace(/\s*[([].*?[)\]]/g, ''));
  return Boolean(f.titles?.some((t) => norm(t) === title));
}
