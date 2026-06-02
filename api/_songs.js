// Curated rotation for the daily puzzle.
//
// Files prefixed with "_" are NOT treated as routes by Vercel — this is a
// shared module imported by api/daily.js.
//
// Each entry is just a title + artist. The daily endpoint resolves a fresh
// 30s preview via the iTunes Search API at request time, so we don't have to
// hardcode (rotating) track IDs or preview URLs. Pick widely recognizable
// songs so the top search result is reliably the real thing.

export const SONGS = [
  { title: 'Mr. Brightside', artist: 'The Killers' },
  { title: 'Billie Jean', artist: 'Michael Jackson' },
  { title: 'Take On Me', artist: 'a-ha' },
  { title: 'Smells Like Teen Spirit', artist: 'Nirvana' },
  { title: 'Rolling in the Deep', artist: 'Adele' },
  { title: 'Sweet Child O Mine', artist: "Guns N' Roses" },
  { title: 'Uptown Funk', artist: 'Mark Ronson' },
  { title: 'Wonderwall', artist: 'Oasis' },
  { title: 'Seven Nation Army', artist: 'The White Stripes' },
  { title: 'Africa', artist: 'Toto' },
  { title: 'Bohemian Rhapsody', artist: 'Queen' },
  { title: 'Shape of You', artist: 'Ed Sheeran' },
  { title: 'Hey Ya!', artist: 'OutKast' },
  { title: 'Dont Stop Believin', artist: 'Journey' },
  { title: 'Bad Guy', artist: 'Billie Eilish' },
  { title: 'Sweet Dreams (Are Made of This)', artist: 'Eurythmics' },
  { title: 'Superstition', artist: 'Stevie Wonder' },
  { title: 'Somebody That I Used to Know', artist: 'Gotye' },
  { title: 'I Want It That Way', artist: 'Backstreet Boys' },
  { title: 'Levitating', artist: 'Dua Lipa' },
  { title: 'Crazy', artist: 'Gnarls Barkley' },
  { title: 'No Scrubs', artist: 'TLC' },
  { title: 'Mr. Blue Sky', artist: 'Electric Light Orchestra' },
  { title: 'Dancing Queen', artist: 'ABBA' },
  { title: 'Blinding Lights', artist: 'The Weeknd' },
  { title: 'Come As You Are', artist: 'Nirvana' },
  { title: 'September', artist: 'Earth, Wind & Fire' },
  { title: 'Hips Dont Lie', artist: 'Shakira' },
  { title: 'Get Lucky', artist: 'Daft Punk' },
  { title: 'Toxic', artist: 'Britney Spears' },
];

// Pieces per daily puzzle (the same for everyone): one randomly positioned locked clip
// plus six movable clips to arrange by ear.
export const DAILY_PIECES = 7;

// Wordle-style guess cap: "Check" attempts before the answer is revealed.
export const DAILY_GUESSES = 3;

// Day 0 of the daily rotation (UTC).
export const LAUNCH_UTC = Date.UTC(2026, 0, 1); // 2026-01-01
