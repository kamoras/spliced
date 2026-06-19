// Curated cross-era classics. Two jobs:
//  1. Practice mode picks from this list.
//  2. scripts/build-catalog.ts seeds the generated daily catalog with these
//     (then fills the rest from iTunes charts) so the catalog isn't all recent
//     hits — `api/_catalog.json` is the source of truth for the daily.
//
// Files prefixed with "_" are NOT treated as routes by Vercel.

export interface CuratedSong {
  title: string;
  artist: string;
}

export const SONGS: CuratedSong[] = [
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
  // More cross-era classics to balance the chart-sourced (recent) catalog.
  { title: 'Johnny B. Goode', artist: 'Chuck Berry' },
  { title: 'Stand by Me', artist: 'Ben E. King' },
  { title: 'My Girl', artist: 'The Temptations' },
  { title: '(Sittin’ On) The Dock of the Bay', artist: 'Otis Redding' },
  { title: 'Good Vibrations', artist: 'The Beach Boys' },
  { title: 'Brown Eyed Girl', artist: 'Van Morrison' },
  { title: 'A Change Is Gonna Come', artist: 'Sam Cooke' },
  { title: 'Stairway to Heaven', artist: 'Led Zeppelin' },
  { title: 'Sweet Home Alabama', artist: 'Lynyrd Skynyrd' },
  { title: 'American Pie', artist: 'Don McLean' },
  { title: 'Piano Man', artist: 'Billy Joel' },
  { title: 'Bridge Over Troubled Water', artist: 'Simon & Garfunkel' },
  { title: 'I Will Survive', artist: 'Gloria Gaynor' },
  { title: "Stayin' Alive", artist: 'Bee Gees' },
  { title: 'Le Freak', artist: 'CHIC' },
  { title: "Livin' on a Prayer", artist: 'Bon Jovi' },
  { title: 'Tainted Love', artist: 'Soft Cell' },
  { title: 'Girls Just Want to Have Fun', artist: 'Cyndi Lauper' },
  { title: 'Walking on Sunshine', artist: 'Katrina & The Waves' },
  { title: 'Enter Sandman', artist: 'Metallica' },
  { title: 'Zombie', artist: 'The Cranberries' },
  { title: 'Bitter Sweet Symphony', artist: 'The Verve' },
  { title: "Gangsta's Paradise", artist: 'Coolio' },
  { title: 'Killing Me Softly With His Song', artist: 'Fugees' },
  { title: 'In da Club', artist: '50 Cent' },
  { title: 'Yeah!', artist: 'Usher' },
  { title: 'Boulevard of Broken Dreams', artist: 'Green Day' },
  { title: 'Clocks', artist: 'Coldplay' },
  { title: 'Stronger', artist: 'Kanye West' },
  { title: 'Rolling in the Deep', artist: 'Adele' },
  { title: 'Mr. Jones', artist: 'Counting Crows' },
  { title: 'Take Me Out', artist: 'Franz Ferdinand' },
  { title: 'Float On', artist: 'Modest Mouse' },
  { title: 'Smooth', artist: 'Santana' },
  { title: 'No Diggity', artist: 'Blackstreet' },
  { title: 'Vogue', artist: 'Madonna' },
  { title: 'Karma Police', artist: 'Radiohead' },
  { title: 'Under the Bridge', artist: 'Red Hot Chili Peppers' },
  { title: 'Basket Case', artist: 'Green Day' },
];

// Multi-track daily: four mystery songs, four clips per song.
export const DAILY_TRACKS = 4;
export const DAILY_CLIPS_PER_TRACK = 4;
export const DAILY_PIECES = DAILY_TRACKS * DAILY_CLIPS_PER_TRACK;

// Harmonies-style mistake cap: correct track submissions do not consume one.
export const DAILY_GUESSES = 4;

// Day 0 of the daily rotation (UTC).
export const LAUNCH_UTC = Date.UTC(2026, 0, 1); // 2026-01-01
