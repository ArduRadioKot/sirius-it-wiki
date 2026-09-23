const PREFIX = 'sirius-wiki-' + self.registration.scope;
const CACHE = PREFIX + '3044ca2f52308c52';
const VERSION = CACHE.slice(PREFIX.length);
const CORE = ['./', 'index.html', 'styles.css', 'theme.js', 'schedule.js', 'schedule-source.js', 'app.js', 'pwa.js', 'manifest.webmanifest', 'content-index.json', 'data/schedule.json', 'assets/sirius-logo.svg', 'assets/sirius-logo-dark.svg', 'assets/arrow-left.svg', 'assets/arrow-right.svg', 'assets/arrow-up-right.svg', 'assets/icon-192.png', 'assets/icon-512.png', 'vendor/katex/katex.min.css', 'vendor/katex/katex.min.js', 'vendor/katex/auto-render.min.js', 'vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2', 'vendor/katex/fonts/KaTeX_Main-Regular.woff', 'vendor/katex/fonts/KaTeX_AMS-Regular.ttf', 'vendor/katex/fonts/KaTeX_Main-BoldItalic.woff', 'vendor/katex/fonts/KaTeX_AMS-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size3-Regular.woff2', 'vendor/katex/fonts/KaTeX_Main-Regular.woff2', 'vendor/katex/fonts/KaTeX_Script-Regular.ttf', 'vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2', 'vendor/katex/fonts/KaTeX_Size3-Regular.ttf', 'vendor/katex/fonts/KaTeX_Typewriter-Regular.woff', 'vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff', 'vendor/katex/fonts/KaTeX_Typewriter-Regular.ttf', 'vendor/katex/fonts/KaTeX_Main-Italic.woff', 'vendor/katex/fonts/KaTeX_Caligraphic-Bold.ttf', 'vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2', 'vendor/katex/fonts/KaTeX_Math-Italic.woff2', 'vendor/katex/fonts/KaTeX_Size4-Regular.woff2', 'vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2', 'vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff', 'vendor/katex/fonts/KaTeX_SansSerif-Bold.ttf', 'vendor/katex/fonts/KaTeX_Fraktur-Regular.woff', 'vendor/katex/fonts/KaTeX_Main-Bold.ttf', 'vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2', 'vendor/katex/fonts/KaTeX_Main-Bold.woff2', 'vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2', 'vendor/katex/fonts/KaTeX_Fraktur-Regular.ttf', 'vendor/katex/fonts/KaTeX_Main-Regular.ttf', 'vendor/katex/fonts/KaTeX_Size2-Regular.woff', 'vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2', 'vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2', 'vendor/katex/fonts/KaTeX_Script-Regular.woff2', 'vendor/katex/fonts/KaTeX_Size4-Regular.woff', 'vendor/katex/fonts/KaTeX_Size3-Regular.woff', 'vendor/katex/fonts/KaTeX_AMS-Regular.woff', 'vendor/katex/fonts/KaTeX_Main-Bold.woff', 'vendor/katex/fonts/KaTeX_SansSerif-Italic.ttf', 'vendor/katex/fonts/KaTeX_Math-Italic.ttf', 'vendor/katex/fonts/KaTeX_Size1-Regular.woff', 'vendor/katex/fonts/KaTeX_SansSerif-Regular.woff', 'vendor/katex/fonts/KaTeX_Main-Italic.ttf', 'vendor/katex/fonts/KaTeX_Math-Italic.woff', 'vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2', 'vendor/katex/fonts/KaTeX_Fraktur-Bold.ttf', 'vendor/katex/fonts/KaTeX_Size2-Regular.ttf', 'vendor/katex/fonts/KaTeX_SansSerif-Italic.woff', 'vendor/katex/fonts/KaTeX_Main-Italic.woff2', 'vendor/katex/fonts/KaTeX_Size1-Regular.woff2', 'vendor/katex/fonts/KaTeX_Fraktur-Bold.woff', 'vendor/katex/fonts/KaTeX_Script-Regular.woff', 'vendor/katex/fonts/KaTeX_SansSerif-Regular.ttf', 'vendor/katex/fonts/KaTeX_Math-BoldItalic.woff', 'vendor/katex/fonts/KaTeX_Size1-Regular.ttf', 'vendor/katex/fonts/KaTeX_Caligraphic-Regular.ttf', 'vendor/katex/fonts/KaTeX_Size4-Regular.ttf', 'vendor/katex/fonts/KaTeX_Size2-Regular.woff2', 'vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2', 'vendor/katex/fonts/KaTeX_Main-BoldItalic.ttf', 'vendor/katex/fonts/KaTeX_SansSerif-Bold.woff', 'vendor/katex/fonts/KaTeX_Math-BoldItalic.ttf'];
function abortAfter(ms) {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
async function store(cache, request, response) {
  const headers = new Headers(response.headers);
  const copy = new Response(await response.blob(), {status: response.status, statusText: response.statusText, headers});
  await cache.put(request, copy);
}
async function precache(paths, required) {
  const cache = await caches.open(CACHE);
  const results = await Promise.allSettled(paths.map(async (path) => {
    const response = await fetch(path, {cache: 'reload', signal: abortAfter(15000)});
    if (!response.ok) throw new Error(path);
    await store(cache, path, response);
  }));
  if (required) {
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
  }
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const fonts = CORE.filter((path) => path.includes('vendor/katex/fonts/'));
    const optional = ['./', ...fonts];
    const shell = CORE.filter((path) => !optional.includes(path));
    await precache(shell, true);
    await precache(optional, false);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'VERSION', version: VERSION });
  }
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const base = new URL(self.registration.scope);
  if (event.request.method !== 'GET' || url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;
  const relative = url.pathname.slice(base.pathname.length);
  const shellPage = event.request.mode === 'navigate' && (relative === '' || relative === 'index.html');
  // PDFs, calendar feeds and other files opened directly go straight to the network.
  if (!CORE.includes(relative) && !shellPage) return;
  if (relative.endsWith('.json')) return event.respondWith(json(event, url, relative));
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // The shell is versioned as a whole, so the cached page always matches the cached scripts.
    // Serving it first makes the installed app open instantly; a new version arrives via a new worker.
    if (shellPage) {
      const saved = await cache.match('index.html');
      if (saved) return saved;
      try {
        const response = await fetch(event.request, {cache:'no-store', signal:abortAfter(15000)});
        if (response.ok) await cache.put('index.html', response.clone());
        return response;
      } catch { return Response.error(); }
    }
    return (await cache.match(event.request)) || fetch(event.request);
  })());
});
function checkJson(relative, data) {
  if (relative === 'data/schedule.json' && (!data.groups || !data.updatedAt)) throw new Error('Invalid schedule');
  if (relative === 'content-index.json' && (!Array.isArray(data.life) || !Array.isArray(data.articles))) throw new Error('Invalid index');
}
async function json(event, url, relative) {
  const cache = await caches.open(CACHE);
  const key = new Request(new URL(relative, self.registration.scope).href);
  const bust = url.searchParams.has('t');
  const download = async () => {
    const response = await fetch(event.request, {cache:'reload', signal:abortAfter(bust ? 20000 : 15000)});
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const text = await response.clone().text();
    checkJson(relative, JSON.parse(text));
    const previous = await cache.match(key);
    const changed = !previous || (await previous.text()) !== text;
    await cache.put(key, response.clone());
    return {response, changed};
  };
  // Explicit refreshes (?t=…) must reach the network; they fail rather than return stale data.
  if (bust) {
    try { return (await download()).response; } catch { return Response.error(); }
  }
  // Everything else: answer from the cache at once and refresh it in the background.
  const saved = await cache.match(key);
  if (!saved) {
    try { return (await download()).response; } catch { return Response.error(); }
  }
  event.waitUntil(download().then(async ({changed}) => {
    if (!changed) return;
    for (const client of await self.clients.matchAll({type:'window'})) client.postMessage({type:'JSON_UPDATED', path:relative});
  }).catch(() => {}));
  return saved;
}
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL('#/schedule', self.registration.scope).href;
    const windows = await self.clients.matchAll({type:'window', includeUncontrolled:true});
    const existing = windows.find(client => client.url.startsWith(self.registration.scope));
    if (!existing) return self.clients.openWindow(url);
    // navigate() rejects for clients this worker does not control; focusing still helps.
    try { await existing.navigate(url); } catch {}
    return existing.focus();
  })());
});
