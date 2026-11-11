// Package one lesson at a time for the wiki. The shared index contains navigation data only.
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = 'courses/matan';
const paths = ['index.html', 'textbook.html'];
for (const dir of ['lessons', 'reference']) {
  for (const name of await readdir(`${root}/${dir}`)) {
    if (name.endsWith('.html')) paths.push(`${dir}/${name}`);
  }
}

const pages = {};
for (const source of paths) {
  const html = await readFile(`${root}/${source}`, 'utf8');
  const key = source.replace(/\.html$/, '');
  const body = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] || '';
  const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1]);
  const scripts = [...html.matchAll(/<script\s*>([\s\S]*?)<\/script>/g)].map(match => match[1]);
  const title = html.match(/<title>(.*?)<\/title>/)?.[1] || key;
  const keywords = [...body.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)]
    .map(match => match[1].replace(/<[^>]*>/g, '').trim()).join(' ').slice(0, 1800);
  const modulePath = `materials/pages/${key}.js`;
  pages[key] = { title, keywords, modulePath };
  const file = `${root}/${modulePath}`;
  await mkdir(path.dirname(file), { recursive: true });
  const initializer = scripts.length ? `export function initialize(Course) {\n${scripts.join('\n')}\n}\n` : '';
  await writeFile(file, `export default ${JSON.stringify({ html: body, styles })};\n${initializer}`);
}
await writeFile(`${root}/assets/pages-data.js`, `window.MatanPages = ${JSON.stringify(pages, null, 2)};\n`);
console.log(`Packed ${paths.length} individual course pages.`);
