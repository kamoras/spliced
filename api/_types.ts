// Types shared across the serverless handlers and the catalog build script.
//
// Files prefixed with "_" are NOT treated as routes by Vercel.

// A pinned catalog entry (api/_catalog.json) — already resolved to a preview.
export interface CatalogEntry {
  trackId: number;
  title: string;
  artist: string;
  artwork: string;
  previewUrl: string;
  // Original release year and a friendly genre bucket (see api/_genres.ts),
  // added by scripts/catalog-meta.ts. Used for row clues and decoys.
  year?: number;
  genre?: string;
  // Tempo and the time of a beat in the preview (scripts/beats.ts), plus how
  // confident that analysis is (0..1). Used to cut clips on the beat.
  bpm?: number;
  beat?: number;
  beatConf?: number;
}

// The (partial) shape of an iTunes Search/Lookup result we read.
export interface ITunesResult {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  kind?: string;
  releaseDate?: string;
  primaryGenreName?: string;
}
