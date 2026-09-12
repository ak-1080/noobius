import { cp, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameAssets = path.resolve(here, '../public');
const output = path.join(here, 'dist');
const pages = ['index.html', 'story/index.html', 'site.css', 'background.js'];
const media = [
  'favicon.svg',
  'assets/noobius-night-shift-reel.mp4',
  'assets/noobius-night-shift-reel-mobile.mp4',
  'assets/noobius-reel-poster.jpg',
  'assets/noobius-reel-poster-mobile.jpg',
  'assets/noobius.jpeg',
];

// Explicit allowlist: never copy the game build, routes, database, or credentials.
const files = [
  ...pages.map(name => [path.join(here, name), name]),
  ...media.map(name => [path.join(gameAssets, name), name]),
  [path.join(here, 'fonts/space-grotesk-latin.woff2'), 'assets/fonts/space-grotesk-latin.woff2'],
  [path.join(here, 'fonts/ibm-plex-mono-latin.woff2'), 'assets/fonts/ibm-plex-mono-latin.woff2'],
  [path.join(here, 'fonts/SPACE-GROTESK-LICENSE.txt'), 'assets/fonts/SPACE-GROTESK-LICENSE.txt'],
  [path.join(here, 'fonts/IBM-PLEX-MONO-LICENSE.txt'), 'assets/fonts/IBM-PLEX-MONO-LICENSE.txt'],
];
for (const [source] of files) await stat(source);
for (const [source, name] of files) {
  const destination = path.join(output, name);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}
console.log(`Coming-soon static site: ${output} (${files.length} files)`);
