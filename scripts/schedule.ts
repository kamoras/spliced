// Prints the daily schedule so a bad day is visible before it ships:
//
//   npm run schedule              # the next 30 days
//   npm run schedule -- 365       # a year
//   npm run schedule -- 365 --stats

import {
  CATALOG,
  dailyEligible,
  isClassic,
  scheduleFor,
} from '../api/daily.js';
import { featureFor } from '../api/_features.js';
import { puzzleDate, puzzleNumberFor } from '../shared/game.js';

const days = Number(process.argv[2]) || 30;
const stats = process.argv.includes('--stats');
const start = puzzleNumberFor(Date.now());
let featureDays = 0;
const decades = new Map<number, number>();
for (let n = start; n < start + days; n++) {
  const { songs, epoch } = scheduleFor(n);
  const date = puzzleDate(n).toISOString().slice(0, 10);
  const feature = featureFor(puzzleDate(n));
  if (feature) featureDays++;
  const line = songs
    .map((s) => `${s.year} ${s.artist} - ${s.title}${isClassic(s) ? ' *' : ''}`)
    .join(' | ');
  if (!stats)
    console.log(
      `#${n} ${date} e${epoch}${feature ? ` [${feature.id}]` : ''}: ${line}`
    );
  songs.forEach((s) => {
    const d = Math.floor((s.year ?? 0) / 10) * 10;
    decades.set(d, (decades.get(d) ?? 0) + 1);
  });
}
if (stats) {
  console.log(
    `eligible songs: ${CATALOG.filter(dailyEligible).length} of ${CATALOG.length}`
  );
  console.log(
    'decades:',
    [...decades.entries()]
      .sort()
      .map(([d, c]) => `${d}s ${c}`)
      .join(', ')
  );
  console.log(`observance days: ${featureDays}`);
}
