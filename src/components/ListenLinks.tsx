// Discovery links shown once a song is revealed. We use search URLs (not stored
// per-service IDs) so they work for every song without extra resolution.

import Icon from './Icon.jsx';

interface Service {
  name: string;
  href: (query: string) => string;
}

const SERVICES: Service[] = [
  {
    name: 'Apple Music',
    href: (q) => `https://music.apple.com/search?term=${q}`,
  },
  { name: 'Spotify', href: (q) => `https://open.spotify.com/search/${q}` },
  {
    name: 'YouTube',
    href: (q) => `https://www.youtube.com/results?search_query=${q}`,
  },
];

export default function ListenLinks({
  title,
  artist,
}: {
  title?: string;
  artist?: string;
}) {
  if (!title) return null;
  const query = encodeURIComponent(`${title} ${artist || ''}`.trim());

  return (
    <div className="listen-links">
      <span className="listen-label">Listen</span>
      {SERVICES.map((service) => (
        <a
          key={service.name}
          className="listen-link"
          href={service.href(query)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Find ${title} by ${artist} on ${service.name}`}
        >
          {service.name}
          <Icon name="external" />
        </a>
      ))}
    </div>
  );
}
