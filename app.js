const app = document.getElementById("app");
let index = { life: [], articles: [] };
let currentDay = null;
let currentSubject = null;
let studyView = "day";

// База вычисляется от URL самого app.js, а не от адреса страницы.
// Это важно для GitHub Pages, где сайт обычно живёт в /<repo>/.
const appScript = document.querySelector('script[src$="app.js"]');
const APP_BASE_URL = new URL("./", appScript?.src || window.location.href);

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function siteUrl(relativePath) {
  const clean = String(relativePath || "")
    .replace(/^\.\//, "")
    .split("/")
    .map((part) => encodeURIComponent(safeDecode(part)))
    .join("/");
  return new URL(clean, APP_BASE_URL);
}

const esc = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c],
  );
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "");

function inlineMarkdown(text) {
  const math = [];
  const protectedText = String(text).replace(
    /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|(?<!\$)\$(?!\$)[\s\S]*?(?<!\$)\$(?!\$))/g,
    (formula) => {
      math.push(formula);
      return `\u0000MATH${math.length - 1}\u0000`;
    },
  );
  return esc(protectedText)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>',
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/\u0000MATH(\d+)\u0000/g, (_, i) => math[i]);
}

function downloadBlock(fields) {
  if (!fields.file) return "";
  const title = fields.title || "Скачать файл";
  const description = fields.description
    ? `<p>${inlineMarkdown(fields.description)}</p>`
    : "";
  const fileName = fields.file.split(/[\\/]/).pop() || "download";
  const fileUrl = siteUrl(fields.file).href;
  return `<aside class="download-block"><div><strong>${esc(title)}</strong>${description}</div><a href="${esc(fileUrl)}" download="${esc(fileName)}" aria-label="${esc(title)}">Скачать</a></aside>`;
}

function parseMarkdown(md) {
  md = md.replace(/^---[\s\S]*?---\s*/, "");
  const lines = md.replace(/\r/g, "").split("\n");
  let out = "",
    para = [],
    list = null,
    code = false,
    codeLang = "",
    codeBuf = [],
    download = null;
  const flushPara = () => {
    if (para.length) {
      out += `<p>${inlineMarkdown(para.join(" "))}</p>`;
      para = [];
    }
  };
  const closeList = () => {
    if (list) {
      out += `</${list}>`;
      list = null;
    }
  };

  for (const line of lines) {
    if (/^:::download\s*$/.test(line.trim())) {
      flushPara();
      closeList();
      download = {};
      continue;
    }
    if (download && /^:::\s*$/.test(line.trim())) {
      out += downloadBlock(download);
      download = null;
      continue;
    }
    if (download) {
      const field = line.match(/^\s*(title|file|description):\s*(.*)$/);
      if (field) download[field[1]] = field[2].trim();
      continue;
    }
    if (/^```/.test(line)) {
      flushPara();
      closeList();
      if (!code) {
        code = true;
        codeLang = line.slice(3).trim();
        codeBuf = [];
      } else {
        out += `<pre><code${codeLang ? ` class="language-${esc(codeLang)}"` : ""}>${esc(codeBuf.join("\n"))}</code></pre>`;
        code = false;
      }
      continue;
    }
    if (code) {
      codeBuf.push(line);
      continue;
    }
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.+)$/))) {
      flushPara();
      closeList();
      const n = m[1].length;
      out += `<h${n} id="${slugify(m[2])}">${inlineMarkdown(m[2])}</h${n}>`;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushPara();
      closeList();
      out += "<hr>";
      continue;
    }
    if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara();
      closeList();
      out += `<blockquote>${inlineMarkdown(m[1])}</blockquote>`;
      continue;
    }
    if ((m = line.match(/^[-*+]\s+(.+)$/))) {
      flushPara();
      if (list !== "ul") {
        closeList();
        list = "ul";
        out += "<ul>";
      }
      out += `<li>${inlineMarkdown(m[1])}</li>`;
      continue;
    }
    if ((m = line.match(/^\d+[.)]\s+(.+)$/))) {
      flushPara();
      if (list !== "ol") {
        closeList();
        list = "ol";
        out += "<ol>";
      }
      out += `<li>${inlineMarkdown(m[1])}</li>`;
      continue;
    }
    para.push(line.trim());
  }

  flushPara();
  closeList();
  if (code) out += `<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`;
  return out;
}

function renderMath() {
  if (typeof renderMathInElement !== "function") return;
  renderMathInElement(app, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\[", right: "\\]", display: true },
      { left: "$", right: "$", display: false },
      { left: "\\(", right: "\\)", display: false },
    ],
    throwOnError: false,
  });
}

function routeFor(item) {
  return item.type === "life"
    ? `#/life/${encodeURIComponent(item.slug)}`
    : `#/study/${encodeURIComponent(item.day)}/${encodeURIComponent(item.slug)}`;
}

function formatDate(iso) {
  if (iso === "undated") return "Без подтверждённой даты";
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${iso}T12:00:00`));
  } catch {
    return iso;
  }
}

function parseFrontMatter(md, fallbackTitle) {
  const match = md.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  const meta = {};
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const i = line.indexOf(":");
      if (i === -1) continue;
      const key = line.slice(0, i).trim();
      let value = line.slice(i + 1).trim();
      value = value.replace(/^['"]|['"]$/g, "");
      meta[key] = value;
    }
  }
  return {
    title: meta.title || fallbackTitle,
    description: meta.description || "",
    subject: meta.subject || "Другое",
    order: Number(meta.order || 9999),
  };
}

async function fetchDirectory(path) {
  const res = await fetch(siteUrl(path), { cache: "no-store" });
  if (!res.ok) throw new Error(`Не удалось открыть ${path}`);
  const html = await res.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  return [...doc.querySelectorAll("a[href]")]
    .map((a) => a.getAttribute("href"))
    .filter(Boolean)
    .map((href) => decodeURIComponent(href.split("?")[0].split("#")[0]));
}

async function buildItem(type, path, slug, day = null) {
  try {
    const res = await fetch(siteUrl(path), { cache: "no-store" });
    if (!res.ok) throw new Error(path);
    const md = await res.text();
    const fallbackTitle = slug
      .replace(/[-_]+/g, " ")
      .replace(/^./, (c) => c.toUpperCase());
    const meta = parseFrontMatter(md, fallbackTitle);
    return { type, path, slug, day, content: md, ...meta };
  } catch (err) {
    console.warn("Не удалось прочитать Markdown:", path, err);
    return null;
  }
}

async function discoverContentLocally() {
  const lifeLinks = await fetchDirectory("life/");
  const lifeFiles = lifeLinks.filter(
    (h) => /\.md$/i.test(h) && !h.includes("/"),
  );
  const life = (
    await Promise.all(
      lifeFiles.map((file) => {
        const slug = file.replace(/\.md$/i, "");
        return buildItem("life", `life/${file}`, slug);
      }),
    )
  )
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"));

  const articleRoot = await fetchDirectory("articles/");
  const dayFolders = articleRoot
    .filter((h) => /^\d{4}-\d{2}-\d{2}\/$/.test(h) || h === "undated/")
    .map((h) => h.replace(/\/$/, ""));

  const articleGroups = await Promise.all(
    dayFolders.map(async (day) => {
      const links = await fetchDirectory(`articles/${day}/`);
      const files = links.filter((h) => /\.md$/i.test(h) && !h.includes("/"));
      return Promise.all(
        files.map((file) => {
          const slug = file.replace(/\.md$/i, "");
          return buildItem("article", `articles/${day}/${file}`, slug, day);
        }),
      );
    }),
  );

  const articles = articleGroups
    .flat()
    .filter(Boolean)
    .sort(
      (a, b) =>
        (a.day === "undated" ? 1 : b.day === "undated" ? -1 : b.day.localeCompare(a.day)) ||
        a.order - b.order ||
        a.title.localeCompare(b.title, "ru"),
    );

  return { life, articles };
}

async function loadGeneratedIndex() {
  const res = await fetch(siteUrl("content-index.json"), { cache: "no-store" });
  if (!res.ok) throw new Error("content-index.json не найден");
  const data = await res.json();
  if (!Array.isArray(data.life) || !Array.isArray(data.articles))
    throw new Error("Некорректный content-index.json");
  return data;
}

function isLocalPreview() {
  const hostname = location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" ||
    hostname === "::1" || hostname === "[::1]" || hostname.endsWith(".local") ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

async function loadIndex() {
  try {
    // На локальном python -m http.server сохраняем удобство: новые файлы видны сразу.
    if (isLocalPreview() && navigator.onLine && !navigator.serviceWorker?.controller) {
      try {
        index = await discoverContentLocally();
        return;
      } catch (localError) {
        console.info(
          "Directory listing недоступен, используем content-index.json",
          localError,
        );
      }
    }

    // На GitHub Pages список каталогов недоступен. Индекс создаёт GitHub Actions при каждом push.
    index = await loadGeneratedIndex();
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <section class="article-page">
        <h1>Не удалось загрузить базу статей</h1>
        <p>Файл <code>content-index.json</code> отсутствует или повреждён.</p>
        <p>Если сайт опубликован через GitHub Pages, проверь, что workflow <code>Deploy Sirius Wiki to GitHub Pages</code> завершился успешно и в настройках Pages выбран источник <strong>GitHub Actions</strong>.</p>
      </section>`;
    throw err;
  }
}

function home() {
  const latest = [...index.articles]
    .sort((a, b) => (b.day + b.title).localeCompare(a.day + a.title))
    .slice(0, 6);
  app.innerHTML = `
    <section class="hero">
      <span class="eyebrow">Студенческая база знаний</span>
      <h1>Университет Сириус</h1>
      <p class="hero-lead">Практическая вики про учёбу и жизнь в университете. Инструкции, конспекты, полезные места и ответы на вопросы, которые обычно приходится искать в чатах.</p>
    </section>
    <section class="home-grid">
      <a class="section-card study" href="#/study"><span class="card-index">01 / STUDY</span><div><h2>Учёба</h2><p>Конспекты, лекции и материалы по дням и предметам.</p></div><span class="card-arrow" aria-hidden="true"><span class="icon icon-arrow-up-right"></span></span></a>
      <a class="section-card life" href="#/life"><span class="card-index">02 / CAMPUS</span><div><h2>Жизнь</h2><p>Кампус, быт, сервисы, мероприятия и всё, что происходит вне пар.</p></div><span class="card-arrow" aria-hidden="true"><span class="icon icon-arrow-up-right"></span></span></a>
    </section>
    <section class="schedule-home"><a href="#/schedule"><span class="eyebrow">Каждый день под рукой</span><h2>Расписание и время до пары →</h2><p>ИОП-ИТ-25 и ИОП-ИТ-26 · обе группы · доступно без интернета</p></a></section>
    <section class="latest">
      <div class="section-heading"><h2>Последние материалы</h2><p>${index.articles.length} материалов в учебной базе</p></div>
      <div class="article-list">${latest.map(tile).join("") || '<div class="empty-state">Пока нет статей.</div>'}</div>
    </section>`;
}

function tile(item) {
  const meta = item.type === "life"
    ? "ЖИЗНЬ"
    : `${esc(item.subject || "Другое")} · ${formatDate(item.day)}`;
  return `<a class="article-tile" href="${routeFor(item)}"><div class="tile-meta">${meta}</div><div><h3>${esc(item.title)}</h3><p>${esc(item.description || "")}</p></div></a>`;
}

function lifePage() {
  app.innerHTML = `<section class="page"><div class="page-top"><div><span class="eyebrow">Раздел 02</span><h1>Жизнь</h1></div><p class="page-description">Всё, что помогает быстрее освоиться: кампус, инфраструктура, документы, мероприятия, бытовые вопросы и полезные советы студентов.</p></div>
  <div class="content-layout"><aside class="sidebar"><p class="sidebar-title">Материалы</p>${index.life.map((x) => `<a href="${routeFor(x)}">${esc(x.title)}</a>`).join("")}</aside><div class="entries">${index.life.map(entryRow).join("") || '<div class="empty-state">Добавь Markdown-файлы в папку life/. На GitHub Pages они появятся автоматически после следующего push и деплоя.</div>'}</div></div></section>`;
}

function entryRow(x, mode = "day") {
  let label = "Гайд";
  if (x.type !== "life") {
    label = mode === "subject"
      ? formatDate(x.day)
      : esc(x.subject || "Другое");
  }
  return `<a class="entry-row" href="${routeFor(x)}"><span class="date">${label}</span><div><h3>${esc(x.title)}</h3><p>${esc(x.description || "")}</p></div><span class="entry-arrow" aria-hidden="true"><span class="icon icon-arrow-right"></span></span></a>`;
}

function studyPage({ day = null, subject = null, view = "day" } = {}) {
  const days = [...new Set(index.articles.map((x) => x.day).filter(Boolean))]
    .sort((a, b) => a === "undated" ? 1 : b === "undated" ? -1 : b.localeCompare(a));
  const subjects = [...new Set(index.articles.map((x) => x.subject || "Другое"))]
    .sort((a, b) => a.localeCompare(b, "ru"));

  studyView = view === "subject" ? "subject" : "day";
  currentDay = day && days.includes(day) ? day : days[0] || null;
  currentSubject = subject && subjects.includes(subject) ? subject : subjects[0] || null;

  const items = studyView === "subject"
    ? index.articles
        .filter((x) => !currentSubject || (x.subject || "Другое") === currentSubject)
        .sort((a, b) => (a.day === "undated" ? 1 : b.day === "undated" ? -1 : b.day.localeCompare(a.day)) || a.order - b.order || a.title.localeCompare(b.title, "ru"))
    : index.articles
        .filter((x) => !currentDay || x.day === currentDay)
        .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"));

  const sidebarItems = studyView === "subject"
    ? subjects.map((name) => `<button class="day-button subject-button ${name === currentSubject ? "active" : ""}" aria-pressed="${name === currentSubject}" data-subject="${esc(name)}">${esc(name)}</button>`).join("")
    : days.map((d) => `<button class="day-button ${d === currentDay ? "active" : ""}" aria-pressed="${d === currentDay}" data-day="${d}">${formatDate(d)}</button>`).join("");

  app.innerHTML = `<section class="page"><div class="page-top"><div><span class="eyebrow">Раздел 01</span><h1>Учёба</h1></div><p class="page-description">Конспекты и учебные материалы по дням и предметам. Выберите нужную дату или дисциплину в списке.</p></div>
  <div class="study-switch" role="group" aria-label="Способ сортировки"><button type="button" class="study-switch-button ${studyView === "day" ? "active" : ""}" aria-pressed="${studyView === "day"}" data-view="day">По дням</button><button type="button" class="study-switch-button ${studyView === "subject" ? "active" : ""}" aria-pressed="${studyView === "subject"}" data-view="subject">По предметам</button></div>
  <div class="content-layout"><aside class="sidebar"><p class="sidebar-title">${studyView === "subject" ? "По предметам" : "По дням"}</p>${sidebarItems}</aside><div class="entries">${items.map((x) => entryRow(x, studyView)).join("") || '<div class="empty-state">Пока нет учебных материалов.</div>'}</div></div></section>`;

  document.querySelectorAll(".study-switch-button").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.view === "subject") {
        const first = currentSubject || subjects[0] || "";
        location.hash = `#/study?view=subject${first ? `&subject=${encodeURIComponent(first)}` : ""}`;
      } else {
        const first = currentDay || days[0] || "";
        location.hash = `#/study?view=day${first ? `&day=${encodeURIComponent(first)}` : ""}`;
      }
    }),
  );

  document.querySelectorAll("[data-day]").forEach((b) =>
    b.addEventListener("click", () => {
      location.hash = `#/study?view=day&day=${encodeURIComponent(b.dataset.day)}`;
    }),
  );

  document.querySelectorAll("[data-subject]").forEach((b) =>
    b.addEventListener("click", () => {
      location.hash = `#/study?view=subject&subject=${encodeURIComponent(b.dataset.subject)}`;
    }),
  );
}

async function articlePage(item) {
  if (!item) {
    notFound();
    return;
  }
  try {
    // На GitHub Pages Markdown уже встроен в content-index.json во время сборки.
    // Поэтому открытие статьи не зависит от URL файла и не ломается в /<repo>/.
    let md = item.content;

    // Совместимость со старыми индексами и локальным режимом.
    if (typeof md !== "string") {
      const res = await fetch(siteUrl(item.path), { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${item.path}`);
      md = await res.text();
    }

    const back =
      item.type === "life"
        ? "#/life"
        : `#/study?view=day&day=${encodeURIComponent(item.day)}`;
    const kicker = item.type === "life"
      ? "Жизнь"
      : `${esc(item.subject || "Другое")} · ${formatDate(item.day)}`;
    app.innerHTML = `<article class="article-page"><header class="article-head"><a class="back-link" href="${back}"><span class="icon icon-arrow-left" aria-hidden="true"></span>Назад</a><div class="article-kicker">${kicker}</div><h1>${esc(item.title)}</h1>${item.description ? `<p class="summary">${esc(item.description)}</p>` : ""}</header><div class="markdown">${parseMarkdown(md)}</div></article>`;
    renderMath();
  } catch (error) {
    console.error("Не удалось открыть статью:", item, error);
    app.innerHTML =
      '<section class="article-page"><h1>Не удалось открыть статью</h1><p>Статья есть в списке, но её содержимое не удалось загрузить. Сделай новый push, чтобы GitHub Actions заново собрал <code>content-index.json</code>.</p><p><a class="back-link" href="#/"><span class="icon icon-arrow-left" aria-hidden="true"></span>На главную</a></p></section>';
  }
}

function notFound() {
  app.innerHTML =
    '<section class="article-page"><h1>404</h1><p>Такой страницы нет.</p><p><a class="back-link" href="#/"><span class="icon icon-arrow-left" aria-hidden="true"></span>На главную</a></p></section>';
}

async function router() {
  const raw = location.hash.slice(1) || "/";
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(safeDecode);

  if (!parts.length) home();
  else if (parts[0] === "schedule") window.SiriusSchedule.render();
  else if (parts[0] === "life" && parts.length === 1) lifePage();
  else if (parts[0] === "life" && parts[1])
    await articlePage(index.life.find((x) => x.slug === parts[1]));
  else if (parts[0] === "study" && parts.length === 1) {
    const p = new URLSearchParams(qs || "");
    studyPage({
      day: p.get("day"),
      subject: p.get("subject"),
      view: p.get("view") || (p.get("subject") ? "subject" : "day"),
    });
  } else if (parts[0] === "study" && parts[1] && parts[2]) {
    await articlePage(
      index.articles.find((x) => x.day === parts[1] && x.slug === parts[2]),
    );
  } else notFound();

  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

const searchDialog = document.getElementById("searchDialog");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

const SITE_PAGES = [
  {
    type: "page",
    title: "Главная",
    description: "Обзор вики, свежие материалы и быстрый доступ к разделам",
    href: "#/",
    keywords: "главная вики сириус home",
  },
  {
    type: "page",
    title: "Учёба",
    description: "Учебные статьи по дням и предметам",
    href: "#/study",
    keywords: "учёба учеба лекции материалы предметы",
  },
  {
    type: "page",
    title: "Жизнь",
    description: "Кампус, быт, транспорт, сервисы и адаптация",
    href: "#/life",
    keywords: "жизнь кампус интернат сервисы",
  },
  {
    type: "page",
    title: "Расписание",
    description: "Пары, аудитории, отсчёт до занятия и напоминания",
    href: "#/schedule",
    keywords: "расписание пары группа иоп аудитория календарь",
  },
];

function stripSearchText(md = "") {
  return String(md)
    .replace(/^---[\s\S]*?---\s*/, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/:::[\s\S]*?:::/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|=]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokens(q) {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function matchScore(item, tokens) {
  const title = String(item.title || "").toLowerCase();
  const description = String(item.description || "").toLowerCase();
  const subject = String(item.subject || "").toLowerCase();
  const keywords = String(item.keywords || "").toLowerCase();
  const body = stripSearchText(item.content).toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 100;
    else if (subject.includes(token) || keywords.includes(token)) score += 70;
    else if (description.includes(token)) score += 50;
    else if (body.includes(token)) score += 20;
    else return 0;
  }
  if (item.type === "page") score += 5;
  return score;
}

function matchSnippet(item, tokens) {
  const plain = stripSearchText(item.content);
  if (!plain || !tokens.length) return item.description || "";
  const lower = plain.toLowerCase();
  const token = tokens.find((t) => lower.includes(t));
  if (!token) return item.description || "";
  const at = lower.indexOf(token);
  const start = Math.max(0, at - 42);
  const end = Math.min(plain.length, at + token.length + 68);
  const slice = plain.slice(start, end).trim();
  return `${start > 0 ? "…" : ""}${slice}${end < plain.length ? "…" : ""}`;
}

function searchLabel(item) {
  if (item.type === "page") return "Раздел";
  if (item.type === "life") return "Жизнь";
  return `${item.subject || "Другое"} · ${formatDate(item.day)}`;
}

function searchHref(item) {
  return item.href || routeFor(item);
}

function openSearch() {
  searchDialog.showModal();
  searchInput.value = "";
  renderSearch("");
  setTimeout(() => searchInput.focus(), 20);
}

function renderSearch(q) {
  const tokens = searchTokens(q);
  const articles = [...(index?.life || []), ...(index?.articles || [])];
  const catalog = [...SITE_PAGES, ...articles];
  const ranked = tokens.length
    ? catalog
        .map((item) => ({ item, score: matchScore(item, tokens) }))
        .filter((row) => row.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            a.item.title.localeCompare(b.item.title, "ru"),
        )
        .map((row) => row.item)
    : [...SITE_PAGES, ...articles.slice(0, 6)];

  const rows = ranked.slice(0, 16);
  searchResults.innerHTML =
    rows
      .map((x) => {
        const snippet = tokens.length ? matchSnippet(x, tokens) : x.description || "";
        return `<a class="search-result" href="${searchHref(x)}"><strong>${esc(x.title)}</strong><span>${esc(searchLabel(x))}${snippet ? " · " + esc(snippet) : ""}</span></a>`;
      })
      .join("") || '<div class="empty-state">Ничего не найдено</div>';
  searchResults
    .querySelectorAll("a")
    .forEach((a) => (a.onclick = () => searchDialog.close()));
}

document.getElementById("searchOpen").onclick = openSearch;
document.getElementById("mobileSearchOpen").onclick = () => {
  closeMenu();
  openSearch();
};
searchInput.oninput = (e) => renderSearch(e.target.value);
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openSearch();
  }
});

const menu = document.getElementById("mobileMenu");
const menuButton = document.getElementById("menuButton");
function isMenuOpen() {
  return menu.classList.contains("is-open");
}
function openMenu() {
  menu.classList.add("is-open");
  menu.setAttribute("aria-hidden", "false");
  menuButton.setAttribute("aria-expanded", "true");
  menuButton.setAttribute("aria-label", "Закрыть меню");
  document.body.classList.add("menu-open");
}
function closeMenu() {
  if (!isMenuOpen()) return;
  menu.classList.remove("is-open");
  menu.setAttribute("aria-hidden", "true");
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Открыть меню");
  document.body.classList.remove("menu-open");
}
menuButton.onclick = () => {
  if (isMenuOpen()) closeMenu();
  else openMenu();
};
menu.querySelectorAll("a").forEach((a) => (a.onclick = closeMenu));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});
window.addEventListener("hashchange", () => closeMenu());

window.addEventListener("hashchange", router);
loadIndex().then(router);
