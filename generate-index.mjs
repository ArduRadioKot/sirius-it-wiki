import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const lifeDir = path.join(root, 'life');
const articlesDir = path.join(root, 'articles');

function parseFrontMatter(md, fallbackTitle) {
  const match = md.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  const meta = {};

  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i === -1) continue;
      const key = line.slice(0, i).trim();
      let value = line.slice(i + 1).trim();
      value = value.replace(/^['"]|['"]$/g, '');
      meta[key] = value;
    }
  }

  return {
    title: meta.title || fallbackTitle,
    description: meta.description || '',
    subject: meta.subject || 'Другое',
    order: Number(meta.order || 9999)
  };
}

function fallbackTitle(slug) {
  return slug
    .replace(/[-_]+/g, ' ')
    .replace(/^./, char => char.toUpperCase());
}

async function markdownFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map(entry => entry.name);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function buildLife() {
  const files = await markdownFiles(lifeDir);
  const result = [];

  for (const file of files) {
    const slug = file.replace(/\.md$/i, '');
    const md = await fs.readFile(path.join(lifeDir, file), 'utf8');
    const meta = parseFrontMatter(md, fallbackTitle(slug));

    result.push({
      type: 'life',
      path: `life/${file}`,
      slug,
      content: md,
      day: null,
      ...meta
    });
  }

  return result.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'ru'));
}

async function buildArticles() {
  let dayEntries = [];
  try {
    dayEntries = await fs.readdir(articlesDir, { withFileTypes: true });
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const days = dayEntries
    .filter(entry => entry.isDirectory() && (/^\d{4}-\d{2}-\d{2}$/.test(entry.name) || entry.name === 'undated'))
    .map(entry => entry.name);

  const result = [];

  for (const day of days) {
    const dir = path.join(articlesDir, day);
    const files = await markdownFiles(dir);

    for (const file of files) {
      const slug = file.replace(/\.md$/i, '');
      const md = await fs.readFile(path.join(dir, file), 'utf8');
      const meta = parseFrontMatter(md, fallbackTitle(slug));

      result.push({
        type: 'article',
        path: `articles/${day}/${file}`,
        slug,
        content: md,
        day,
        ...meta
      });
    }
  }

  return result.sort((a, b) =>
    (a.day === 'undated' ? 1 : b.day === 'undated' ? -1 : b.day.localeCompare(a.day)) ||
    a.order - b.order ||
    a.title.localeCompare(b.title, 'ru')
  );
}

const outfile = path.join(root, 'content-index.json');
const life = await buildLife();
const articles = await buildArticles();

function payload(index) {
  return JSON.stringify({ life: index.life, articles: index.articles });
}

const next = { generatedAt: new Date().toISOString(), life, articles };

try {
  const previous = JSON.parse(await fs.readFile(outfile, 'utf8'));
  if (payload(previous) === payload(next)) {
    console.log(`content-index.json: unchanged (${life.length} life, ${articles.length} articles)`);
    process.exit(0);
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await fs.writeFile(outfile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');

console.log(`content-index.json: ${life.length} life, ${articles.length} articles`);
