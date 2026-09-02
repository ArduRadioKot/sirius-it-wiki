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
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
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
    b.day.localeCompare(a.day) ||
    a.order - b.order ||
    a.title.localeCompare(b.title, 'ru')
  );
}

const index = {
  generatedAt: new Date().toISOString(),
  life: await buildLife(),
  articles: await buildArticles()
};

await fs.writeFile(
  path.join(root, 'content-index.json'),
  `${JSON.stringify(index, null, 2)}\n`,
  'utf8'
);

console.log(`content-index.json: ${index.life.length} life, ${index.articles.length} articles`);
