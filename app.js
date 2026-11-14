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
      (_, label, url) => url.startsWith('#/') ? `<a href="${url}">${label}</a>` : `<a href="${url}" target="_blank" rel="noopener">${label}</a>`,
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

const QUIZ_LETTERS = ["А", "Б", "В", "Г", "Д", "Е"];

function quizBlock(fields) {
  const answer = Number(fields.answer);
  if (!fields.question || !fields.options?.length || !Number.isInteger(answer) || answer < 1 || answer > fields.options.length) return "";
  const options = fields.options
    .map((option, index) => `<button type="button" class="quiz-option" data-option="${index + 1}"><span class="quiz-letter" aria-hidden="true">${QUIZ_LETTERS[index] || index + 1}</span><span class="quiz-option-text">${inlineMarkdown(option)}</span></button>`)
    .join("");
  return `<section class="quiz-block" data-answer="${answer}"><div class="quiz-label">Проверь себя</div><p class="quiz-question">${inlineMarkdown(fields.question)}</p><div class="quiz-options">${options}</div><p class="quiz-feedback" role="status" aria-live="polite"></p><div class="quiz-explanation" hidden>${inlineMarkdown(fields.explanation || "")}</div></section>`;
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
    download = null,
    quiz = null,
    table = null;
  const splitRow = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  const flushTable = () => {
    if (!table) return;
    const rows = table.map(splitRow);
    const hasHead = rows.length > 1 && rows[1].every((cell) => /^:?-{2,}:?$/.test(cell));
    const head = hasHead ? `<thead><tr>${rows[0].map((c) => `<th>${inlineMarkdown(c)}</th>`).join("")}</tr></thead>` : "";
    const body = (hasHead ? rows.slice(2) : rows).map((r) => `<tr>${r.map((c) => `<td>${inlineMarkdown(c)}</td>`).join("")}</tr>`).join("");
    out += `<div class="table-wrap"><table>${head}<tbody>${body}</tbody></table></div>`;
    table = null;
  };
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
    if (/^:::quiz\s*$/.test(line.trim())) {
      flushPara();
      closeList();
      quiz = { options: [] };
      continue;
    }
    if (quiz && /^:::\s*$/.test(line.trim())) {
      out += quizBlock(quiz);
      quiz = null;
      continue;
    }
    if (quiz) {
      const field = line.match(/^\s*(question|option|answer|explanation):\s*(.*)$/);
      if (field) {
        if (field[1] === "option") quiz.options.push(field[2].trim());
        else quiz[field[1]] = field[2].trim();
      }
      continue;
    }
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
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      closeList();
      (table ||= []).push(line);
      continue;
    }
    flushTable();
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.+)$/))) {
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

  flushTable();
  flushPara();
  closeList();
  if (code) out += `<pre><code>${esc(codeBuf.join("\n"))}</code></pre>`;
  return out;
}

app.addEventListener("click", (event) => {
  const button = event.target.closest(".quiz-option");
  if (!button || !app.contains(button)) return;
  const quiz = button.closest(".quiz-block");
  if (quiz.dataset.answered) return;
  const answer = Number(quiz.dataset.answer);
  const correct = Number(button.dataset.option) === answer;
  quiz.dataset.answered = correct ? "correct" : "wrong";
  for (const option of quiz.querySelectorAll(".quiz-option")) {
    const isAnswer = Number(option.dataset.option) === answer;
    option.classList.toggle("is-correct", isAnswer);
    option.classList.toggle("is-incorrect", option === button && !correct);
    option.classList.toggle("is-chosen", option === button);
    option.disabled = true;
  }
  quiz.querySelector(".quiz-feedback").textContent = correct ? "Верно" : "Неверно — правильный ответ отмечен";
  quiz.querySelector(".quiz-explanation").hidden = false;
  const session = quiz.closest(".review-session");
  if (session) updateReviewProgress(session);
});

function updateReviewProgress(session) {
  const total = session.querySelectorAll(".quiz-block").length;
  const answered = session.querySelectorAll(".quiz-block[data-answered]").length;
  const right = session.querySelectorAll('.quiz-block[data-answered="correct"]').length;
  session.querySelector(".review-progress-value").textContent = `${answered} из ${total}`;
  session.querySelector(".review-progress-bar span").style.width = `${total ? (answered / total) * 100 : 0}%`;
  const result = session.querySelector(".review-result");
  if (answered === total && total) {
    result.hidden = false;
    result.querySelector(".review-score").textContent = `${right} из ${total}`;
    result.querySelector(".review-verdict").textContent =
      right === total ? "Всё верно — тема усвоена." : right / total >= 0.7 ? "Хороший результат. Перечитай разборы ошибок." : "Стоит вернуться к конспекту и пройти ещё раз.";
  }
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

async function loadGeneratedIndex() {
  const res = await fetch(siteUrl("content-index.json"), { cache: "no-store" });
  if (!res.ok) throw new Error("content-index.json не найден");
  const data = await res.json();
  if (!Array.isArray(data.life) || !Array.isArray(data.articles))
    throw new Error("Некорректный content-index.json");
  return data;
}

async function loadIndex() {
  try {
    index = await loadGeneratedIndex();
  } catch (err) {
    console.error(err);
    // The schedule may already be on screen and does not need the index.
    if (location.hash.startsWith("#/schedule")) return;
    app.innerHTML = `
      <section class="article-page">
        <h1>Не удалось загрузить базу статей</h1>
        <p>Файл <code>content-index.json</code> отсутствует или повреждён.</p>
        <p>Если сайт опубликован через GitHub Pages, проверь, что workflow <code>Update content index</code> завершился успешно после последнего push со статьями.</p>
      </section>`;
    throw err;
  }
}

const ROUND_ARROW = '<span class="round-arrow" aria-hidden="true"><span class="icon icon-arrow-sirius"></span></span>';
const TILE_ART = ["21", "23", "26", "22", "24"];

function home() {
  // Newest dated notes first; notes without a confirmed date never count as "latest".
  const latest = index.articles
    .filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a.day))
    .sort((a, b) => b.day.localeCompare(a.day) || a.title.localeCompare(b.title, "ru"))
    .slice(0, 6);
  app.innerHTML = `
    <section class="hero">
      <div class="hero-banner">
        <span class="hero-deco hero-deco-circles" aria-hidden="true"></span>
        <span class="hero-deco hero-deco-plus" aria-hidden="true"></span>
        <span class="hero-deco hero-deco-rings" aria-hidden="true"></span>
        <h1><span>Университет</span> <span>Сириус</span></h1>
        <p class="hero-tagline">Вики про учёбу и жизнь</p>
        <p class="hero-text">Инструкции, конспекты, полезные места и ответы на вопросы, которые обычно приходится искать в чатах.</p>
        <div class="hero-actions"><a class="hero-cta" href="#/schedule">Открыть расписание</a><span class="hero-chevrons" aria-hidden="true"></span></div>
      </div>
      <a class="section-card study" href="#/study">
        <img class="card-art" src="assets/cards/study.svg" alt="" loading="lazy">
        <h2>Учёба</h2>${ROUND_ARROW}
      </a>
      <a class="section-card life" href="#/life">
        <img class="card-art" src="assets/cards/campus.png" alt="" loading="lazy">
        <h2>Жизнь</h2>${ROUND_ARROW}
      </a>
    </section>
    <section class="latest">
      <div class="section-heading"><h2>Последние материалы</h2><p>${index.articles.length} материалов в учебной базе</p></div>
      <div class="article-list">${latest.map(tile).join("") || '<div class="empty-state">Пока нет статей.</div>'}</div>
    </section>`;
}

function tile(item, i = 0) {
  const meta =
    item.type === "life"
      ? '<span class="tile-subject">Жизнь</span>'
      : `<span class="tile-subject">${esc(item.subject || "Другое")}</span><span class="tile-date">${formatDate(item.day)}</span>`;
  const art = TILE_ART[i % TILE_ART.length];
  return `<a class="article-tile" href="${routeFor(item)}"><div class="tile-meta">${meta}</div><div class="tile-body"><h3>${esc(item.title)}</h3><p>${esc(item.description || "")}</p></div><div class="tile-foot">${ROUND_ARROW}<img class="tile-art" src="assets/cards/pattern-${art}.svg" alt="" loading="lazy"></div></a>`;
}

function lifePage() {
  app.innerHTML = `<section class="page"><div class="page-top"><div><span class="eyebrow">Раздел 02</span><h1>Жизнь</h1></div><p class="page-description">Всё, что помогает быстрее освоиться: кампус, инфраструктура, документы, мероприятия, бытовые вопросы и полезные советы студентов.</p></div>
  <div class="content-layout"><aside class="sidebar"><p class="sidebar-title">Материалы</p>${index.life.map((x) => `<a href="${routeFor(x)}">${esc(x.title)}</a>`).join("")}</aside><div class="entries">${index.life.map(entryRow).join("") || '<div class="empty-state">Добавь Markdown-файлы в папку life/. На GitHub Pages они появятся автоматически после следующего push и деплоя.</div>'}</div></div></section>`;
}

function entryRow(x, mode = "day") {
  let label = "Гайд";
  if (x.type !== "life") {
    label = mode === "subject" ? formatDate(x.day) : esc(x.subject || "Другое");
  }
  return `<a class="entry-row" href="${routeFor(x)}"><span class="date">${label}</span><div><h3>${esc(x.title)}</h3><p>${esc(x.description || "")}</p></div><span class="entry-arrow" aria-hidden="true"><span class="icon icon-arrow-right"></span></span></a>`;
}

function quizSections(markdown) {
  return String(markdown || "").match(/^:::quiz\s*$[\s\S]*?^:::\s*$/gm) || [];
}

async function fetchArticle(item) {
  if (typeof item.content === "string") return item.content;
  const response = await fetch(siteUrl(item.path));
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${item.path}`);
  return response.text();
}

function reviewArticles() {
  return index.articles.map(item => ({
    item,
    count: item.quizCount ?? quizSections(item.content).length,
  })).filter(row => row.count);
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

const questionsLabel = (n) => `${n} ${plural(n, "вопрос", "вопроса", "вопросов")}`;

function studyPage({ day = null, subject = null, view = "day" } = {}) {
  const reviews = reviewArticles();
  const questionCount = reviews.reduce((total, row) => total + row.count, 0);
  const subjectCount = new Set(reviews.map((row) => row.item.subject || "Другое")).size;
  const days = [
    ...new Set(index.articles.map((x) => x.day).filter(Boolean)),
  ].sort((a, b) =>
    a === "undated" ? 1 : b === "undated" ? -1 : b.localeCompare(a),
  );
  const subjects = [
    ...new Set(index.articles.map((x) => x.subject || "Другое")),
  ].sort((a, b) => a.localeCompare(b, "ru"));

  studyView = view === "subject" ? "subject" : "day";
  currentDay = day && days.includes(day) ? day : days[0] || null;
  currentSubject =
    subject && subjects.includes(subject) ? subject : subjects[0] || null;

  const items =
    studyView === "subject"
      ? index.articles
          .filter(
            (x) =>
              !currentSubject || (x.subject || "Другое") === currentSubject,
          )
          .sort(
            (a, b) =>
              (a.day === "undated"
                ? 1
                : b.day === "undated"
                  ? -1
                  : b.day.localeCompare(a.day)) ||
              a.order - b.order ||
              a.title.localeCompare(b.title, "ru"),
          )
      : index.articles
          .filter((x) => !currentDay || x.day === currentDay)
          .sort(
            (a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru"),
          );

  const sidebarItems =
    studyView === "subject"
      ? subjects
          .map(
            (name) =>
              `<button class="day-button subject-button ${name === currentSubject ? "active" : ""}" aria-pressed="${name === currentSubject}" data-subject="${esc(name)}">${esc(name)}</button>`,
          )
          .join("")
      : days
          .map(
            (d) =>
              `<button class="day-button ${d === currentDay ? "active" : ""}" aria-pressed="${d === currentDay}" data-day="${d}">${formatDate(d)}</button>`,
          )
          .join("");

  app.innerHTML = `<section class="page"><div class="page-top"><div><span class="eyebrow">Раздел 01</span><h1>Учёба</h1></div><p class="page-description">Конспекты и учебные материалы по дням и предметам. Выберите нужную дату или дисциплину в списке.</p></div>
  <a class="study-review" href="#/study/review"><img class="study-review-art" src="assets/cards/pattern-23.svg" alt="" loading="lazy"><div class="study-review-text"><span class="study-review-title">Самопроверка</span><p>Короткие тесты по конспектам с разбором каждого ответа</p><span class="study-review-meta">${questionsLabel(questionCount)} · ${subjectCount} ${plural(subjectCount, "предмет", "предмета", "предметов")}</span></div>${ROUND_ARROW}</a>
  <a class="study-review" href="#/study/matan"><img class="study-review-art" src="assets/cards/pattern-24.svg" alt="" loading="lazy"><div class="study-review-text"><span class="study-review-title">Курс математического анализа</span><p>Уроки, интерактивный учебник, тренажёры и карточки к коллоквиуму</p><span class="study-review-meta">9 уроков · 6 глав · 26 вопросов</span></div>${ROUND_ARROW}</a>
  <a class="study-review" href="#/study/linear"><img class="study-review-art" src="assets/cards/pattern-22.svg" alt="" loading="lazy"><div class="study-review-text"><span class="study-review-title">Учебник по линейной алгебре</span><p>Планиметрия, движения плоскости и доказательства к коллоквиуму</p><span class="study-review-meta">6 глав · 17 билетов · 34 разбора</span></div>${ROUND_ARROW}</a>
  <a class="study-review" href="#/study/account"><div class="study-review-text"><span class="study-review-title">Личный кабинет</span><p>Оценки, посещаемость, домашние задания и сессия</p></div>${ROUND_ARROW}</a>
  <div class="study-switch" role="group" aria-label="Способ сортировки"><button type="button" class="study-switch-button ${studyView === "day" ? "active" : ""}" aria-pressed="${studyView === "day"}" data-view="day">По дням</button><button type="button" class="study-switch-button ${studyView === "subject" ? "active" : ""}" aria-pressed="${studyView === "subject"}" data-view="subject">По предметам</button></div>
  <div class="content-layout"><aside class="sidebar"><p class="sidebar-title">${studyView === "subject" ? "По предметам" : "По дням"}</p>${sidebarItems}</aside><div class="entries">${items.map((x) => entryRow(x, studyView)).join("") || '<div class="empty-state">Пока нет учебных материалов.</div>'}</div></div></section>`;

  const filters = studyView === "subject" ? subjects : days;
  const position = filters.indexOf(studyView === "subject" ? currentSubject : currentDay);
  const filterLink = (value) => value && `#/study?view=${studyView}&${studyView}=${encodeURIComponent(value)}`;
  SiriusSwipe.setRoutes(app.querySelector(".entries"), filterLink(filters[position - 1]), filterLink(filters[position + 1]), true);

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

async function reviewPage({ path = "", subject = "" } = {}) {
  const reviews = reviewArticles();
  const groups = new Map();
  for (const row of reviews) {
    const key = row.item.subject || "Другое";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const subjects = [...groups.keys()].sort((a, b) => a.localeCompare(b, "ru"));
  let session = null;
  if (subject && groups.has(subject)) {
    const rows = groups.get(subject);
    session = { key: `s:${subject}`, kicker: `${rows.length} ${plural(rows.length, "тема", "темы", "тем")}`, title: `${subject}: все вопросы`, items: rows.map(row => row.item), theory: null };
  } else {
    const row = reviews.find((r) => r.item.path === path) || reviews[0];
    if (row) session = { key: `a:${row.item.path}`, kicker: `${row.item.subject || "Другое"} · ${formatDate(row.item.day)}`, title: row.item.title, items: [row.item], theory: routeFor(row.item), subject: row.item.subject || "Другое" };
  }
  if (session) {
    const hash = location.hash;
    session.questions = [];
    app.innerHTML = '<section class="page"><h1>Самопроверка</h1><p role="status">Загружаем вопросы…</p></section>';
    try {
      for (const item of session.items) {
        if (hash !== location.hash) return;
        session.questions.push(...quizSections(await fetchArticle(item)));
      }
    } catch (error) {
      if (hash === location.hash) showMaterialError(error);
      return;
    }
    if (hash !== location.hash) return;
  }
  const activeSubject = subject || session?.subject || "";
  const href = (q) => `#/study/review?${q}`;
  const nav = subjects
    .map((name) => {
      const rows = groups.get(name);
      const total = rows.reduce((n, r) => n + r.count, 0);
      const allKey = `s:${name}`;
      const topics = rows
        .map(({ item, count }) => {
          const key = `a:${item.path}`;
          return `<a class="review-topic ${session?.key === key ? "active" : ""}" href="${href(`article=${encodeURIComponent(item.path)}`)}" ${session?.key === key ? 'aria-current="page"' : ""}><span>${esc(item.title)}</span><small>${questionsLabel(count)}</small></a>`;
        })
        .join("");
      return `<details class="review-group" ${name === activeSubject ? "open" : ""}><summary><span>${esc(name)}</span><small>${questionsLabel(total)}</small></summary><div class="review-group-body"><a class="review-topic review-topic-all ${session?.key === allKey ? "active" : ""}" href="${href(`subject=${encodeURIComponent(name)}`)}" ${session?.key === allKey ? 'aria-current="page"' : ""}><span>Все вопросы предмета</span><small>${questionsLabel(total)}</small></a>${topics}</div></details>`;
    })
    .join("");
  const total = reviews.reduce((n, r) => n + r.count, 0);
  // Phones get one compact picker instead of the long list of subjects.
  const picker = subjects
    .map((name) => {
      const rows = groups.get(name);
      const all = rows.reduce((n, r) => n + r.count, 0);
      const opts = [`<option value="${href(`subject=${encodeURIComponent(name)}`)}" ${session?.key === `s:${name}` ? "selected" : ""}>Все вопросы предмета · ${all}</option>`]
        .concat(rows.map(({ item, count }) => `<option value="${href(`article=${encodeURIComponent(item.path)}`)}" ${session?.key === `a:${item.path}` ? "selected" : ""}>${esc(item.title)} · ${count}</option>`))
        .join("");
      return `<optgroup label="${esc(name)}">${opts}</optgroup>`;
    })
    .join("");
  app.innerHTML = `<section class="page review-page"><a class="back-link" href="#/study"><span class="icon icon-arrow-left" aria-hidden="true"></span>К учёбе</a>
  <div class="page-top"><div><span class="eyebrow">${questionsLabel(total)} · ${subjects.length} ${plural(subjects.length, "предмет", "предмета", "предметов")}</span><h1>Самопроверка</h1></div><p class="page-description">Выбери тему или весь предмет и ответь на вопросы. После ответа сразу видно, где верный вариант и почему.</p></div>
  ${session ? `<label class="review-picker"><span>Тема</span><select aria-label="Выбрать тему для самопроверки">${picker}</select></label>
  <div class="review-layout"><aside class="review-nav" aria-label="Темы для повторения">${nav}</aside>
  <div class="review-session" data-key="${esc(session.key)}">
    <div class="review-session-head"><span class="review-kicker">${esc(session.kicker)}</span><h2>${esc(session.title)}</h2>
      <div class="review-progress" role="status" aria-live="polite"><div class="review-progress-bar"><span></span></div><strong class="review-progress-value">0 из ${session.questions.length}</strong></div></div>
    <div class="review-questions markdown">${parseMarkdown(session.questions.join("\n\n"))}</div>
    <div class="review-result" hidden><div><span>Результат</span><strong class="review-score"></strong><p class="review-verdict"></p></div><div class="review-result-actions"><button type="button" class="review-restart">Пройти заново</button>${session.theory ? `<a class="review-theory" href="${session.theory}">Открыть конспект</a>` : ""}</div></div>
  </div></div>` : '<div class="empty-state">Пока нет вопросов для самопроверки. Они появятся вместе с конспектами.</div>'}</section>`;
  app.querySelectorAll(".review-session .quiz-block").forEach((quiz, i, all) => {
    quiz.querySelector(".quiz-label").textContent = `Вопрос ${i + 1} из ${all.length}`;
  });
  app.querySelector(".review-picker select")?.addEventListener("change", (event) => {
    location.hash = event.target.value;
  });
  app.querySelector(".review-restart")?.addEventListener("click", async () => {
    await reviewPage({ path, subject });
    app.querySelector(".review-session")?.scrollIntoView({ block: "start" });
  });
  renderMath();
}

async function articlePage(item) {
  if (!item) {
    notFound();
    return;
  }
  const hash = location.hash;
  try {
    const md = await fetchArticle(item);
    if (hash !== location.hash) return;

    const back =
      item.type === "life"
        ? "#/life"
        : `#/study?view=day&day=${encodeURIComponent(item.day)}`;
    const kicker =
      item.type === "life"
        ? "Жизнь"
        : `${esc(item.subject || "Другое")} · ${formatDate(item.day)}`;
    app.innerHTML = `<article class="article-page"><header class="article-head"><a class="back-link" href="${back}"><span class="icon icon-arrow-left" aria-hidden="true"></span>Назад</a><div class="article-kicker">${kicker}</div><h1>${esc(item.title)}</h1>${item.description ? `<p class="summary">${esc(item.description)}</p>` : ""}</header><div class="markdown">${parseMarkdown(md)}</div></article>`;
    renderMath();
  } catch (error) {
    if (hash === location.hash) showMaterialError(error);
  }
}

function showMaterialError(error) {
  const message = error.message.startsWith("HTTP 429")
    ? "Слишком много запросов. Подожди немного и попробуй снова."
    : "Проверь подключение и попробуй открыть материал снова.";
  app.innerHTML = `<section class="article-page"><h1>Не удалось открыть материал</h1><p>${message}</p><button type="button">Повторить</button></section>`;
  // A failed module import can be memoized for the lifetime of the page.
  app.querySelector("button").onclick = error instanceof TypeError ? () => location.reload() : router;
}

function notFound() {
  app.innerHTML =
    '<section class="article-page"><h1>404</h1><p>Такой страницы нет.</p><p><a class="back-link" href="#/"><span class="icon icon-arrow-left" aria-hidden="true"></span>На главную</a></p></section>';
}

const LINEAR_CHAPTERS = [
  { id: "start", title: "Учебник по линейной алгебре", nav: "Как готовиться" },
  { id: "triangles", title: "Стороны, углы и медианы", keywords: "проекции теорема косинусов теорема синусов радиус" },
  { id: "cevians", title: "Чева, Менелай и Дезарг", keywords: "чевианы точка Жергонна направленные отрезки" },
  { id: "area", title: "Трезубец и площадь", keywords: "инцентр эксцентр площадь прямоугольника" },
  { id: "mappings", title: "Отображения, прямые и три отражения", keywords: "лемма о трёх гвоздях образ прямой биекция" },
  { id: "motions", title: "Пять видов движений", keywords: "перенос поворот центральная осевая скользящая симметрия" },
  { id: "compositions", title: "Композиции и теорема Шаля", keywords: "классификация движения композиция ориентация неподвижная точка" },
  { id: "answers", title: "Полный разбор 17 вопросов", keywords: "ответы к коллоквиуму линейная алгебра билеты доказательства" },
];

function linearLink(id) {
  return `#/study/linear?chapter=${id}`;
}

// Reserve space for lazy diagrams so links to questions keep their scroll position.
const LINEAR_FIGURE_SIZES = {
  "axial-symmetry.svg": [760, 300],
  "ceva.svg": [760, 336],
  "cosine-projections.svg": [800, 318],
  "desargues.svg": [648, 444],
  "glide-reflection.svg": [1000, 350],
  "la-area-grid.svg": [760, 398],
  "la-coordinate-motions.svg": [1110, 350],
  "la-cosine-vectors.svg": [675, 350],
  "la-five-motions.svg": [736, 623],
  "la-line-image.svg": [704, 343],
  "la-motion-comparison.svg": [760, 350],
  "la-polygon-area.svg": [640, 345],
  "la-three-nails.svg": [645, 372],
  "la-triangle-types.svg": [760, 322],
  "la-trident-external.svg": [743, 453],
  "la-trident.svg": [850, 645],
  "law-of-sines.svg": [820, 320],
  "mapping-types.svg": [760, 300],
  "median-length.svg": [820, 316],
  "menelaus.svg": [900, 310],
  "plane-motion-classification.svg": [1000, 420],
  "plane-motions.svg": [760, 250],
  "reflections-translation-rotation.svg": [1000, 390],
  "three-reflections.svg": [760, 290],
};

function addLinearFigureViewer(reader) {
  const dialog = document.createElement("dialog");
  dialog.className = "textbook-figure-view";
  dialog.setAttribute("aria-label", "Увеличенная схема");
  dialog.innerHTML = '<form method="dialog"><button type="submit" class="matan-button" autofocus>Закрыть</button></form><div class="textbook-figure-scroll" tabindex="0"><img alt=""></div><p></p>';
  const view = dialog.querySelector("img");
  for (const picture of reader.querySelectorAll(".linear-reading img")) {
    const figure = document.createElement("figure");
    figure.className = "textbook-figure";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "textbook-figure-button";
    button.setAttribute("aria-label", "Увеличить схему: " + picture.alt);
    const caption = document.createElement("figcaption");
    caption.textContent = picture.alt;
    picture.parentElement.replaceWith(figure);
    const dimensions = LINEAR_FIGURE_SIZES[picture.getAttribute("src").split("/").at(-1)];
    if (dimensions) [picture.width, picture.height] = dimensions;
    picture.loading = "lazy";
    button.append(picture);
    button.onclick = () => {
      view.src = picture.src;
      view.alt = picture.alt;
      dialog.querySelector("p").textContent = picture.alt;
      dialog.showModal();
      view.parentElement.scrollLeft = 0;
    };
    figure.append(button, caption);
  }
  if (reader.querySelector(".textbook-figure")) reader.append(dialog);
}

function addMotionLab(reader) {
  const lab = document.createElement("section");
  lab.className = "linear-lab";
  lab.innerHTML = `<h2>Тренажёр координат</h2><p>Измени координаты точки P и сравни её с образом P′.</p>
    <div class="lab-grid">
      <label>Преобразование <select>
        <option value="central">Центральная симметрия относительно начала</option>
        <option value="axis">Отражение относительно оси x</option>
        <option value="shift">Перенос на (3, 1)</option>
        <option value="turn">Поворот на 90° против часовой стрелки</option>
        <option value="glide">Отражение относительно оси x и сдвиг на (3, 0)</option>
      </select></label>
      <label>x <input aria-label="Координата x" type="range" min="-4" max="4" value="2"></label>
      <label>y <input aria-label="Координата y" type="range" min="-4" max="4" value="1"></label>
    </div>
    <svg viewBox="0 0 340 340" role="img" aria-label="Координатная плоскость и образ точки">
      <defs><pattern id="linear-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0H0V20" fill="none" stroke="var(--line)"/>
      </pattern></defs>
      <rect x="10" y="10" width="320" height="320" fill="url(#linear-grid)"/>
      <path d="M10 170h320M170 330V10" fill="none" stroke="var(--muted)"/>
      <text x="321" y="159" fill="currentColor">x</text><text x="180" y="20" fill="currentColor">y</text>
      <line stroke="var(--accent-dark)" stroke-width="2" stroke-dasharray="5 4"/>
      <circle r="6" fill="var(--accent-dark)"/><circle r="6" fill="var(--violet)"/>
    </svg><p class="linear-lab-result" aria-live="polite"></p>`;
  const [xInput, yInput] = lab.querySelectorAll("input");
  const choice = lab.querySelector("select");
  const transforms = {
    central: (x, y) => [-x, -y],
    axis: (x, y) => [x, -y],
    shift: (x, y) => [x + 3, y + 1],
    turn: (x, y) => [-y, x],
    glide: (x, y) => [x + 3, -y],
  };
  const points = lab.querySelectorAll("circle");
  const segment = lab.querySelector("line");
  function update() {
    const x = Number(xInput.value), y = Number(yInput.value);
    const [newX, newY] = transforms[choice.value](x, y);
    [[x, y], [newX, newY]].forEach(([px, py], index) => {
      const cx = 170 + 20 * px, cy = 170 - 20 * py;
      points[index].setAttribute("cx", cx);
      points[index].setAttribute("cy", cy);
      segment.setAttribute("x" + (index + 1), cx);
      segment.setAttribute("y" + (index + 1), cy);
    });
    lab.querySelector(".linear-lab-result").textContent = `P (${x}, ${y}) → P′ (${newX}, ${newY})`;
  }
  lab.addEventListener("input", update);
  update();
  reader.querySelector(".linear-reading h2")?.before(lab);
}

async function linearCoursePage(params) {
  const hash = location.hash;
  const id = params.get("chapter") || "start";
  const position = LINEAR_CHAPTERS.findIndex(chapter => chapter.id === id);
  if (position < 0) return notFound();
  const chapter = LINEAR_CHAPTERS[position];
  const progressKey = "sirius-linear-chapters-v1";
  let completed = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey) || "[]");
    if (Array.isArray(saved)) completed = new Set(saved);
  } catch {}
  const previous = LINEAR_CHAPTERS[position - 1];
  const next = LINEAR_CHAPTERS[position + 1];
  app.innerHTML = `<section class="page matan-page linear-page">
    <a class="back-link" href="#/study"><span class="icon icon-arrow-left" aria-hidden="true"></span>Учёба</a>
    <div class="matan-layout">
      <aside class="sidebar matan-sidebar" aria-label="Содержание учебника"><details class="matan-course-toc" ${innerWidth > 900 ? "open" : ""}><summary>Содержание учебника</summary><nav>
        <p class="sidebar-title">Линейная алгебра</p>
        ${LINEAR_CHAPTERS.map(item => `<a class="matan-nav-link ${item.id === id ? "active" : ""}" ${item.id === id ? 'aria-current="page"' : ""} href="${linearLink(item.id)}" data-linear-chapter="${item.id}">${item.nav || item.title}${completed.has(item.id) ? " ✓" : ""}</a>`).join("")}
      </nav></details></aside>
      <article class="markdown matan-content linear-reader"><h1>${chapter.title}</h1><p role="status">Загружаем главу…</p></article>
    </div></section>`;
  const reader = app.querySelector(".linear-reader");
  try {
    const response = await fetch(siteUrl(`courses/linear/${id}.md`));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (hash !== location.hash || !reader.isConnected) return;

    const html = text.split(/^:::solution[ \t]*\r?\n([\s\S]*?)^:::[ \t]*$/gm)
      .map((part, i) => i % 2 ? `<details class="textbook-worked"><summary>Показать решение</summary>${parseMarkdown(part)}</details>` : parseMarkdown(part))
      .join("");
    reader.innerHTML = `<h1>${chapter.title}</h1><div class="linear-reading">${html}</div>
      ${position > 0 && id !== "answers" ? '<button type="button" class="matan-button linear-complete">Отметить главу прочитанной</button>' : ""}
      <nav class="lesson-nav" aria-label="Переход между главами">
        ${previous ? `<a class="matan-button" href="${linearLink(previous.id)}">← ${previous.nav || previous.title}</a>` : ""}
        ${next ? `<a class="matan-button" href="${linearLink(next.id)}">${next.title} →</a>` : ""}
      </nav>`;
    addLinearFigureViewer(reader);
    if (id === "motions") addMotionLab(reader);
    const complete = reader.querySelector(".linear-complete");
    if (complete) {
      function updateProgress() {
        const read = completed.has(id);
        complete.setAttribute("aria-pressed", String(read));
        complete.textContent = read ? "✓ Глава прочитана" : "Отметить главу прочитанной";
        app.querySelector(`[data-linear-chapter="${id}"]`).textContent = chapter.title + (read ? " ✓" : "");
      }
      updateProgress();
      complete.onclick = () => {
        if (completed.has(id)) completed.delete(id);
        else completed.add(id);
        try { localStorage.setItem(progressKey, JSON.stringify([...completed])); } catch {}
        updateProgress();
      };
    }
    if (id === "answers") {
      reader.classList.add("linear-answers");
      const questions = [...reader.querySelectorAll(".linear-reading h3")];
      const picker = document.createElement("label");
      picker.className = "linear-question-picker";
      picker.innerHTML = `Перейти к вопросу <select><option value="">Выбрать из 17 вопросов</option>${questions.map(heading => `<option value="${esc(heading.id)}">${esc(heading.textContent)}</option>`).join("")}</select>`;
      reader.querySelector(".linear-reading").before(picker);
      const select = picker.querySelector("select");
      const numberOf = heading => heading.textContent.match(/^([12]\.\d+)\./)?.[1];
      select.onchange = () => {
        const heading = questions.find(item => item.id === select.value);
        if (!heading) return;
        const number = numberOf(heading);
        if (number) history.replaceState(history.state, "", `${linearLink(id)}&question=${number}`);
        heading.scrollIntoView({ block: "start" });
      };
      const question = params.get("question");
      const target = question && questions.find(heading => numberOf(heading) === question);
      if (target) {
        select.value = target.id;
        requestAnimationFrame(() => {
          if (hash === location.hash) target.scrollIntoView({ block: "start", behavior: "instant" });
        });
      }
    }
    SiriusSwipe.setRoutes(reader, previous && linearLink(previous.id), next && linearLink(next.id));
    renderMath();
  } catch (error) {
    if (hash === location.hash && reader.isConnected) showMaterialError(error);
  }
}

async function router() {
  const initialHash = location.hash;
  const raw = location.hash.slice(1) || "/";
  const [path, qs] = raw.split("?");
  const parts = path.split("/").filter(Boolean).map(safeDecode);

  const currentSection = `#/${parts[0] || ""}`;
  document.querySelectorAll(".mobile-nav a").forEach((link) => {
    if (link.getAttribute("href") === currentSection) {
      link.setAttribute("aria-current", parts.length > 1 ? "location" : "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  // The schedule lives in its own module, so it opens without waiting for the article index.
  const accountRoute = parts[0] === "study" && parts[1] === "account";
  if (parts[0] !== "schedule" && !accountRoute) await indexReady;
  if (!parts.length) home();
  else if (parts[0] === "schedule") window.SiriusSchedule.render();
  else if (accountRoute) window.SiriusStudentAccount.render(app, new URLSearchParams(qs || ""), window.SiriusSchedule.accountSchedule);
  else if (parts[0] === "life" && parts.length === 1) lifePage();
  else if (parts[0] === "life" && parts[1])
    await articlePage(index.life.find((x) => x.slug === parts[1]));
  else if (parts[0] === "study" && parts[1] === "matan") {
    try {
      await window.SiriusMatan.render(new URLSearchParams(qs || ""));
    } catch (error) {
      if (location.hash === initialHash) showMaterialError(error);
    }
  }
  else if (parts[0] === "study" && parts[1] === "linear") {
    await linearCoursePage(new URLSearchParams(qs || ""));
  }
  else if (parts[0] === "study" && parts[1] === "review") {
    const p = new URLSearchParams(qs || "");
    await reviewPage({ path: p.get("article") || "", subject: p.get("subject") || "" });
  }
  else if (parts[0] === "study" && parts.length === 1) {
    const p = new URLSearchParams(qs || "");
    studyPage({
      day: p.get("day"),
      subject: p.get("subject"),
      view: p.get("view") || (p.get("subject") ? "subject" : "day"),
    });
  } else if (parts[0] === "study" && parts[1] && parts[2]) {
    if (parts[1] === "2026-10-10" && parts[2] === "plane-motions-and-mappings") {
      location.hash = "#/study/2026-10-14/plane-motions-and-mappings";
      return;
    }
    await articlePage(
      index.articles.find((x) => x.day === parts[1] && x.slug === parts[2]),
    );
  } else notFound();

  if (location.hash !== initialHash) return;
  app.focus({ preventScroll: true });
  if (!swipeNavigation.finishRoute(location.hash)) window.scrollTo(0, 0);
}

const searchDialog = document.getElementById("searchDialog");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

const SITE_PAGES = [
  {
    type: "page",
    title: "Личный кабинет",
    description: "Оценки, посещаемость, домашние задания, новости, уведомления и сессия",
    href: "#/study/account",
    keywords: "лк лкс оценки посещаемость журнал зачеты экзамены",
  },
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
    title: "Самопроверка",
    description: "Квизы по учебным конспектам с объяснениями ответов",
    href: "#/study/review",
    keywords: "повторение квизы тесты вопросы учёба",
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

function searchTokens(q) {
  return q.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function matchScore(item, tokens) {
  const title = String(item.title || "").toLowerCase();
  const description = String(item.description || "").toLowerCase();
  const subject = String(item.subject || "").toLowerCase();
  const keywords = String(item.keywords || "").toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 100;
    else if (subject.includes(token) || keywords.includes(token)) score += 70;
    else if (description.includes(token)) score += 50;
    else return 0;
  }
  if (item.type === "page") score += 5;
  return score;
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
  const coursePages = window.SiriusMatan.searchPages();
  const linearPages = LINEAR_CHAPTERS.map(chapter => ({
    type: "page", title: chapter.title, keywords: chapter.keywords,
    subject: "Линейная алгебра", href: linearLink(chapter.id),
  }));
  const catalog = [...SITE_PAGES, ...coursePages, ...linearPages, ...articles];
  const ranked = tokens.length
    ? catalog
        .map((item) => ({ item, score: matchScore(item, tokens) }))
        .filter((row) => row.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score || a.item.title.localeCompare(b.item.title, "ru"),
        )
        .map((row) => row.item)
    : [...SITE_PAGES, ...articles.slice(0, 6)];

  const rows = ranked.slice(0, 16);
  searchResults.innerHTML =
    rows
      .map((x) => {
        const snippet = x.description || "";
        return `<a class="search-result" href="${searchHref(x)}"><strong>${esc(x.title)}</strong><span>${esc(searchLabel(x))}${snippet ? " · " + esc(snippet) : ""}</span></a>`;
      })
      .join("") || '<div class="empty-state">Ничего не найдено</div>';
  searchResults
    .querySelectorAll("a")
    .forEach((a) => (a.onclick = () => searchDialog.close()));
}

document.getElementById("searchOpen").onclick = openSearch;
document.getElementById("mobileSearchOpen").onclick = openSearch;
searchInput.oninput = (e) => renderSearch(e.target.value);
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    openSearch();
  }
});

const sectionRoutes = ["#/", "#/study", "#/life", "#/schedule"];
const swipeNavigation = SiriusSwipe.bind(app, (target) => {
  const week = target.closest(".schedule-week");
  const day = target.closest("#scheduleSwipeArea");
  if (week || day) {
    const selector = week ? ".schedule-shell" : "#scheduleSwipeArea";
    return {
      panel: app.querySelector(selector),
      destination: (step) => ({
        selector,
        commit: () => SiriusSchedule.moveDate(step * (week ? 7 : 1), false),
      }),
    };
  }
  const section = location.hash.split(/[/?]/)[1];
  const position = sectionRoutes.indexOf(section ? `#/${section}` : "#/");
  if (position < 0) return null;
  return { panel: app, destination: (step) => ({ hash: sectionRoutes[position + step] }) };
});

const indexLoad = loadIndex();
// Later navigations render with whatever index is available; a failed first load keeps its error page.
const indexReady = indexLoad.catch(() => {});
window.addEventListener("hashchange", router);
if (location.hash.startsWith("#/schedule")) router();
else indexLoad.then(router, () => {});

// The service worker answers from its cache first and reports when a newer index arrives.
navigator.serviceWorker?.addEventListener("message", async (event) => {
  if (
    event.data?.type !== "JSON_UPDATED" ||
    event.data.path !== "content-index.json"
  )
    return;
  try {
    index = await loadGeneratedIndex();
  } catch {
    return;
  }
  // Re-render lists in place; leave an open article alone so the reader keeps their position.
  const route = (location.hash.slice(1) || "/")
    .split("?")[0]
    .split("/")
    .filter(Boolean);
  if (route[0] === "schedule" || route.length >= 2) return;
  const y = window.scrollY;
  await router();
  window.scrollTo(0, y);
});
