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
  // Broadened for variety + discovery: spanning decades, genres, and regions.
  { title: 'Hotel California', artist: 'Eagles' },
  { title: 'Hey Jude', artist: 'The Beatles' },
  { title: 'Imagine', artist: 'John Lennon' },
  { title: 'Born to Run', artist: 'Bruce Springsteen' },
  { title: 'Dreams', artist: 'Fleetwood Mac' },
  { title: 'Respect', artist: 'Aretha Franklin' },
  { title: 'I Want You Back', artist: 'The Jackson 5' },
  { title: "Ain't No Mountain High Enough", artist: 'Marvin Gaye' },
  { title: 'Lose Yourself', artist: 'Eminem' },
  { title: 'Juicy', artist: 'The Notorious B.I.G.' },
  { title: 'California Love', artist: '2Pac' },
  { title: 'Old Town Road', artist: 'Lil Nas X' },
  { title: 'Like a Prayer', artist: 'Madonna' },
  { title: 'I Wanna Dance with Somebody', artist: 'Whitney Houston' },
  { title: 'Wannabe', artist: 'Spice Girls' },
  { title: 'Since U Been Gone', artist: 'Kelly Clarkson' },
  { title: 'Umbrella', artist: 'Rihanna' },
  { title: 'Single Ladies (Put a Ring on It)', artist: 'Beyoncé' },
  { title: 'Firework', artist: 'Katy Perry' },
  { title: 'Poker Face', artist: 'Lady Gaga' },
  { title: 'Shake It Off', artist: 'Taylor Swift' },
  { title: 'Happy', artist: 'Pharrell Williams' },
  { title: 'Every Breath You Take', artist: 'The Police' },
  { title: 'Losing My Religion', artist: 'R.E.M.' },
  { title: 'Creep', artist: 'Radiohead' },
  { title: 'Yellow', artist: 'Coldplay' },
  { title: 'Titanium', artist: 'David Guetta' },
  { title: 'Despacito', artist: 'Luis Fonsi' },
  { title: 'Gangnam Style', artist: 'PSY' },
  { title: 'Jolene', artist: 'Dolly Parton' },
  { title: 'Take Me Home, Country Roads', artist: 'John Denver' },
  { title: 'Heat Waves', artist: 'Glass Animals' },
  { title: 'Watermelon Sugar', artist: 'Harry Styles' },
  { title: 'good 4 u', artist: 'Olivia Rodrigo' },
  { title: 'Sunflower', artist: 'Post Malone' },
];

// Multi-track daily: four mystery songs, four clips per song.
export const DAILY_TRACKS = 4;
export const DAILY_CLIPS_PER_TRACK = 4;
export const DAILY_PIECES = DAILY_TRACKS * DAILY_CLIPS_PER_TRACK;

// Harmonies-style mistake cap: correct track submissions do not consume one.
export const DAILY_GUESSES = 4;

// Day 0 of the daily rotation (UTC).
export const LAUNCH_UTC = Date.UTC(2026, 0, 1); // 2026-01-01
