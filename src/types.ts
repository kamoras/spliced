// Shared domain types for the mixer puzzle.

// A song as surfaced to the player once revealed (and as stored in the catalog).
export interface Song {
  id?: number;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  previewUrl?: string;
}

// One clip cut from a track: a slice of the decoded preview buffer, plus the
// metadata needed to place, grade, and draw it.
export interface Piece {
  id: string;
  trackId?: string;
  trackIndex?: number;
  // Index this piece must land at to be correct (within its track, 0-based).
  correctIndex: number;
  // Start offset into `buffer`, in seconds, and the clip's length in seconds.
  offset: number;
  duration: number;
  buffer?: AudioBuffer;
  // Normalized (0..1) waveform peaks for the canvas preview.
  peaks: number[];
}

// A track definition before slicing (as the API/practice flow provides it).
export interface TrackDef {
  id?: string;
  previewUrl: string;
  answer?: Song;
}

// A fully prepared track: its decoded buffer cut into ordered pieces.
export interface Track extends TrackDef {
  id: string;
  buffer: AudioBuffer;
  duration: number;
  pieces: Piece[];
}

// Per-clip grade within a submitted row.
export interface CellGrade {
  id: string;
  correct: boolean;
  sameTrack: boolean;
}

// Result of grading one mixer row against the track it claims.
export interface RowGrade {
  solved: boolean;
  trackId: string | null;
  sameTrack: boolean;
  correctPositions: number;
  rightRowCount: number;
  alreadySolved: boolean;
  cells: CellGrade[];
}

// A finished game's outcome, persisted per daily puzzle. Only `solved` is
// guaranteed; the rest are optional so older stored results (and the UI's
// nullish-coalescing reads) stay valid.
export interface GameResult {
  solved: boolean;
  mistakes?: number;
  solvedTracks?: number;
  elapsedMs?: number;
  ts?: number;
}

// The /api/daily payload.
export interface DailyResponse {
  puzzleNumber: number;
  trackCount: number;
  clipsPerTrack: number;
  numPieces: number;
  maxGuesses: number;
  tracks: TrackDef[];
  answers: Song[];
}
