// Map iTunes' long tail of genre names onto a small set of friendly buckets,
// used for row clues ("1984 · Synth-pop" style) and for picking name-that-tune
// decoys from the same neighbourhood.
//
// Files prefixed with "_" are NOT treated as routes by Vercel.

const BUCKETS: [RegExp, string][] = [
  [/hip-?hop|rap/i, 'Hip-hop'],
  [/r&b|soul|funk|disco/i, 'R&B / Soul'],
  [/k-pop/i, 'K-pop'],
  [/latin|latino|mexican|tropical|tango|baladas|urbano/i, 'Latin'],
  [/christian|gospel|ccm/i, 'Gospel'],
  [/jazz|fusion/i, 'Jazz'],
  [/blues|zydeco/i, 'Blues'],
  [/reggae|dancehall|soca|calypso/i, 'Reggae'],
  [/country/i, 'Country'],
  [/metal|hard rock|punk|hardcore/i, 'Hard rock'],
  [/alternative|indie|new wave/i, 'Alternative'],
  [/rock/i, 'Rock'],
  [/folk|celtic|singer\/songwriter/i, 'Folk'],
  [
    /dance|electronic|electronica|house|techno|dubstep|downtempo/i,
    'Electronic',
  ],
  [/soundtrack|musicals|children/i, 'Soundtrack'],
  [/world|europe|hawaii|israeli|afro|egyptian|farsi/i, 'World'],
  [/pop|adult contemporary/i, 'Pop'],
];

export function genreBucket(genre: string | null | undefined): string {
  if (!genre) return 'Pop';
  for (const [re, bucket] of BUCKETS) if (re.test(genre)) return bucket;
  return 'Pop';
}
