// Discovery links shown once a song is revealed. We use search URLs (not stored
// per-service IDs) so they work for every song without extra resolution.

import Icon from './Icon.jsx';

interface Service {
  name: string;
  href: (query: string) => string;
}

const SERVICES: (Service & { short: string })[] = [
  {
    name: 'Apple Music',
    short: 'Apple',
    href: (q) => `https://music.apple.com/search?term=${q}`,
  },
  {
    name: 'Spotify',
    short: 'Spotify',
    href: (q) => `https://open.spotify.com/search/${q}`,
  },
  {
    name: 'YouTube',
    short: 'YouTube',
    href: (q) => `https://www.youtube.com/results?search_query=${q}`,
  },
];

export default function ListenLinks({
  title,
  artist,
  compact = false,
}: {
  title?: string;
  artist?: string;
  compact?: boolean;
}) {
  if (!title) return null;
  const query = encodeURIComponent(`${title} ${artist || ''}`.trim());

  return (
    <div className={compact ? 'listen-links is-compact' : 'listen-links'}>
      {!compact && <span className="listen-label">Listen</span>}
      {SERVICES.map((service) => (
        <a
          key={service.name}
          className="listen-link"
          href={service.href(query)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Find ${title} by ${artist} on ${service.name}`}
        >
          {compact ? service.short : service.name}
          <Icon name="external" />
        </a>
      ))}
    </div>
  );
}
