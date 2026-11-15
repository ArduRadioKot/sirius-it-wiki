import { cp, mkdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';

const root = new URL('../', import.meta.url);
const output = new URL('dist/android-web/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const assets = ['index.html', 'app.js', 'student-account.js', 'schedule.js', 'schedule-source.js',
  'styles.css', 'glass.css', 'theme.js', 'pwa.js', 'now.js', 'gestures.js', 'manifest.webmanifest',
  'content-index.json', 'articles', 'assets', 'courses', 'data', 'life', 'vendor'];

for (const name of assets) {
  await cp(new URL(name, root), new URL(name, output), {
    recursive: true,
    filter: source => !basename(source).startsWith('.'),
  });
}
