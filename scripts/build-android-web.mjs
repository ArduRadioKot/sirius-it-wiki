import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';

const root = new URL('../', import.meta.url);
const output = new URL('dist/android-web/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const assets = ['index.html', 'app.js', 'student-account.js', 'account-schedule.js', 'schedule.js', 'schedule-source.js',
  'styles.css', 'glass.css', 'theme.js', 'pwa.js', 'now.js', 'gestures.js', 'manifest.webmanifest',
  'content-index.json', 'articles', 'assets', 'courses', 'data', 'life', 'vendor'];

for (const name of assets) {
  await cp(new URL(name, root), new URL(name, output), {
    recursive: true,
    filter: source => !basename(source).startsWith('.'),
  });
}

// GitHub's tree identifies each blob by the SHA-1 of its Git object.
// The app uses the same IDs to skip files already included in the APK.
const bundled = {};
async function record(path) {
  const url = new URL(path.split('/').map(encodeURIComponent).join('/'), output);
  if (path.endsWith('/')) {
    const files = await readdir(url, { withFileTypes: true });
    for (const file of files) await record(path + file.name + (file.isDirectory() ? '/' : ''));
    return;
  }
  const bytes = await readFile(url);
  bundled[path] = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

for (const path of ['content-index.json', 'articles/', 'life/', 'courses/', 'assets/']) await record(path);
await writeFile(new URL('bundled-content.json', output), JSON.stringify(bundled));
