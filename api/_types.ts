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
}
