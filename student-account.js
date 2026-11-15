(() => {
  const origin = 'https://lks.siriusuniversity.ru';
  const sources = {
    journal: { title: 'Электронный журнал', path: '/journal/list' },
    trajectory: { title: 'Учебная траектория', path: '/student/trajectory' },
    dashboard: { title: 'Главная ЛК', path: '/dashboard' },
  };
  const tabs = { overview: 'Обзор', grades: 'Оценки', visits: 'Посещаемость', homework: 'Домашние задания', news: 'Новости и уведомления', session: 'Сессия' };
  const data = {};
  const revisions = {};
  const STORE = 'sirius-lk';
  const REMEMBER = 'sirius-lk-remember';
  const storage = {
    get: key => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); return true; } catch { return false; } },
    drop: key => { try { localStorage.removeItem(key); } catch {} },
  };
  const remember = () => storage.get(REMEMBER) !== 'false';
  function save() {
    if (!remember() || !Object.keys(data).length) return storage.drop(STORE);
    storage.set(STORE, JSON.stringify(data));
  }
  try {
    const saved = remember() && JSON.parse(storage.get(STORE) || 'null');
    if (saved && typeof saved === 'object') {
      if (Array.isArray(saved.journal?.value)) data.journal = saved.journal;
      if (Array.isArray(saved.trajectory?.value)) data.trajectory = saved.trajectory;
      if (saved.dashboard?.value && Array.isArray(saved.dashboard.value.news)) data.dashboard = saved.dashboard;
    }
  } catch {}
  let refreshSession = () => {};
  const clean = value => ['string', 'number'].includes(typeof value) ? String(value).trim() : '';
  const values = value => value && typeof value === 'object' ? Object.values(value) : [];
  const label = iso => iso.split('-').reverse().join('.');
  function number(value) {
    const text = clean(value);
    const parsed = /^-?\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : NaN;
    return Number.isFinite(parsed) ? parsed : null;
  }
  const normalize = name => clean(name).toLocaleLowerCase('ru').replace(/\([^)]*\)/g, ' ').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const minutes = time => {
    const match = clean(time).match(/^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
    return match && Number(match[1]) < 24 ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const lessonKind = value => {
    const type = normalize(value);
    if (type.includes('лекц')) return 'lecture';
    if (/практ|семинар/.test(type)) return 'practice';
    if (type.includes('лаб')) return 'lab';
    return '';
  };
  function node(tag, text = '', className = '') {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function link(text, path, external = false) {
    const element = node('a', text, 'journal-link');
    element.href = path;
    if (external) { element.target = '_blank'; element.rel = 'noopener noreferrer'; }
    return element;
  }

  function readDate(date, fallback) {
    const input = clean(date);
    const candidates = [input.includes('.') ? input.split('.').reverse().join('-') : input, fallback];
    return candidates.find(value => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
      const day = new Date(value + 'T00:00:00Z');
      return Number.isFinite(+day) && day.toISOString().startsWith(value);
    });
  }

  function readJournal(weeks) {
    if (!weeks || typeof weeks !== 'object') throw new Error('На странице нет данных электронного журнала.');
    const result = new Map();
    for (const year of values(weeks)) {
      for (const [day, record] of Object.entries(year || {})) {
        for (const discipline of values(record?.disciplines)) {
          for (const [key, mark] of Object.entries(discipline?.grades || {})) {
            if (!mark || typeof mark !== 'object') continue;
            const subject = clean(discipline.discipline) || clean(mark.discipline);
            const date = readDate(mark.start_date, day);
            if (!subject || !date) continue;
            const attendance = typeof mark.absent === 'boolean' ? Number(mark.absent) : number(mark.absent);
            const id = clean(mark.mark_id) || JSON.stringify([date, subject, key]);
            result.set(id, {
              subject, date, time: minutes(mark.start_time), kind: clean(mark.action_type_name),
              grade: number(mark.grade_as_long), absent: attendance === null ? null : attendance !== 0,
              topic: clean(mark.subject), homework: clean(mark.homework),
            });
          }
        }
      }
    }
    return [...result.values()].sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? -1) - (a.time ?? -1));
  }

  function readTrajectory(semesters) {
    if (!semesters || typeof semesters !== 'object') throw new Error('На странице нет данных учебной траектории.');
    return Object.entries(semesters).sort(([a], [b]) => b.localeCompare(a)).map(([key, semester]) => ({
      key, title: clean(semester?.yearTitle) || key,
      subjects: Object.entries(semester?.disciplines || {}).map(([subject, details]) => {
        const forms = values(details?.elements?.regel_part?.control_actions).map(row => clean(row?.control_action?.title)).filter(Boolean);
        const results = values(details?.marks).map(mark => clean(mark) || ['title', 'mark', 'value', 'short_title', 'grade'].map(name => clean(mark?.[name])).find(Boolean)).filter(Boolean);
        return { subject, forms: [...new Set(forms)], results };
      }).filter(row => row.forms.length || row.results.length),
    }));
  }

  function readDashboard(root, noticesRoot) {
    const notices = new Map();
    for (const item of noticesRoot.querySelectorAll('[wire\\:click^="openNotification"]')) {
      const id = item.getAttribute('wire:click');
      const parts = [...item.querySelectorAll('div')].filter(el => !el.children.length).map(el => clean(el.textContent)).filter(Boolean);
      if (parts.length) notices.set(id, { title: parts[0], text: parts.slice(1).join(' · ') });
    }
    const news = new Map();
    for (const item of root.querySelectorAll('a[href*="/news/show/"]')) {
      let url;
      try { url = new URL(item.getAttribute('href'), origin); } catch { continue; }
      if (url.origin !== origin || !/^\/news\/show\/\d+\/?$/.test(url.pathname)) continue;
      const title = clean(item.textContent).replace(/Подробнее\s*$/i, '').trim();
      if (title) news.set(url.pathname, { title, url: origin + url.pathname });
    }
    return { news: [...news.values()], notices: [...notices.values()] };
  }

  function readFile(html, expected) {
    // Keep the saved HTML in an inert template. Only selected data enters the live DOM.
    const documentTemplate = document.createElement('template');
    documentTemplate.innerHTML = html;
    const root = documentTemplate.content;
    const names = { journal: 'journal-list', trajectory: 'trajectory', dashboard: 'user-notifications-menu' };
    for (const element of root.querySelectorAll('[wire\\:initial-data]')) {
      let state;
      try { state = JSON.parse(element.getAttribute('wire:initial-data')); } catch { continue; }
      if (state?.fingerprint?.name !== names[expected]) continue;
      if (expected === 'journal') return readJournal(state.serverMemo?.data?.grades);
      if (expected === 'trajectory') return readTrajectory(state.serverMemo?.data?.semesters);
      return readDashboard(root, element);
    }
    throw new Error('Страница не распознана. Сохраните нужный раздел после входа в ЛК.');
  }

  function entriesFor(slot, group) {
    if (data.journal?.group !== group) return [];
    const marks = data.journal.value;
    return [...new Set(slot.flatMap(lesson => {
      const name = normalize(lesson.title);
      if (!name) return [];
      const kind = lessonKind(lesson.kind);
      const candidates = marks.filter(mark => mark.date === lesson.date && normalize(mark.subject) === name &&
        (!kind || !lessonKind(mark.kind) || lessonKind(mark.kind) === kind));
      const time = minutes(lesson.start);
      const exact = candidates.filter(mark => mark.time !== null && mark.time === time);
      if (exact.length) return exact;
      const nearby = candidates.filter(mark => mark.time !== null && time !== null && Math.abs(mark.time - time) <= 10);
      if (nearby.length === 1) return nearby;
      const untimed = candidates.filter(mark => mark.time === null);
      return candidates.length === 1 && untimed.length === 1 ? untimed : [];
    }))];
  }

  const attendanceLabel = absent => absent === true ? 'Пропуск' : absent === false ? 'Присутствие' : '';
  function lessonRecord(slot, group) {
    return entriesFor(slot, group).map(mark => ({
      subject: mark.subject,
      status: [mark.grade !== null ? 'Оценка ' + mark.grade : '', attendanceLabel(mark.absent)].filter(Boolean).join(' · '),
      topic: mark.topic,
      homework: mark.homework,
    }));
  }

  function section(root, title, meta = '') {
    const block = node('section', '', 'journal-block');
    block.append(node('h2', title));
    if (meta) block.append(node('p', meta, 'journal-meta'));
    root.append(block);
    return block;
  }
  function row(root, title, lines = [], url) {
    const item = node('div', '', 'journal-row');
    item.append(url ? link(title, url, true) : node('strong', title));
    for (const line of lines.filter(Boolean)) item.append(node('span', line));
    root.append(item);
  }
  function entryDetails(mark) {
    return [label(mark.date), mark.kind, mark.topic].filter(Boolean).join(' · ');
  }
  function renderJournal(root, tab) {
    const marks = data.journal?.value;
    const subjects = new Map();
    for (const mark of marks || []) {
      if (!subjects.has(mark.subject)) subjects.set(mark.subject, []);
      subjects.get(mark.subject).push(mark);
    }
    for (const [name, records] of [...subjects.entries()].sort(([a], [b]) => a.localeCompare(b, 'ru'))) {
      if (tab === 'grades') {
        const grades = records.filter(mark => mark.grade !== null);
        if (!grades.length) continue;
        const average = grades.reduce((sum, mark) => sum + mark.grade, 0) / grades.length;
        const block = section(root, name, 'Средний балл ' + average.toLocaleString('ru', { maximumFractionDigits: 2 }));
        for (const mark of grades) row(block, String(mark.grade), [entryDetails(mark)]);
      } else if (tab === 'visits') {
        const measured = records.filter(mark => mark.absent !== null);
        if (!measured.length) continue;
        const missed = measured.filter(mark => mark.absent);
        const rate = Math.round((measured.length - missed.length) / measured.length * 100);
        const block = section(root, name, `${rate}% посещений · пропусков ${missed.length} из ${measured.length} отмеченных пар`);
        for (const mark of missed) row(block, 'Пропуск', [entryDetails(mark)]);
      } else {
        const assignments = records.filter(mark => mark.homework);
        if (!assignments.length) continue;
        const block = section(root, name);
        for (const mark of assignments) row(block, mark.homework, [entryDetails(mark)]);
      }
    }
    if (!root.childElementCount) root.append(node('p', marks ? 'В загруженном журнале нет записей для этого раздела.' : 'Загрузите сохранённую страницу электронного журнала.', 'empty-state'));
  }

  function assessmentType(value) {
    const form = normalize(value);
    if (/дифф|зачет с оценкой/.test(form)) return 'graded-credit';
    if (form.includes('экзамен')) return 'exam';
    if (form.includes('зачет')) return 'credit';
    if (form.includes('коллоквиум')) return 'colloquium';
    if (form.includes('контрольн')) return 'test';
    if (form.includes('консультац')) return 'consultation';
    return '';
  }

  function renderSession(root, schedule, selectTerm) {
    const semesters = data.trajectory?.value || [];
    selectTerm.replaceChildren(new Option('Все семестры', ''));
    for (const info of semesters) selectTerm.add(new Option(info.title, info.key));
    selectTerm.parentElement.hidden = !semesters.length;
    const events = (schedule.rows || []).flatMap(event => {
      const type = assessmentType(event.kind) || assessmentType(event.title);
      return type ? [{ ...event, type }] : [];
    }).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    const selectedSemester = data.trajectory?.semester || '';
    selectTerm.value = selectedSemester;
    const filtered = semesters.filter(term => !selectedSemester || term.key === selectedSemester);
    const controlsBySubject = new Map();
    for (const term of semesters) {
      for (const subject of term.subjects) {
        const name = normalize(subject.subject);
        for (const form of subject.forms) {
          const key = JSON.stringify([name, assessmentType(form)]);
          if (!controlsBySubject.has(key)) controlsBySubject.set(key, new Set());
          controlsBySubject.get(key).add(term.key);
        }
      }
    }
    const used = new Set();
    function dateText(event) {
      return [label(event.date), event.start, event.room].filter(Boolean).join(' · ');
    }
    for (const term of filtered) {
      if (!term.subjects.length) continue;
      const block = section(root, term.title);
      for (const item of term.subjects) {
        const name = normalize(item.subject);
        const matches = data.trajectory?.group !== schedule.group ? [] : events.filter(event => {
          const title = normalize(event.title);
          const titleMatches = title === name || title.startsWith(name + ' ') || title.endsWith(' ' + name);
          if (!name || !titleMatches) return false;
          if (event.type === 'consultation') return semesters.length === 1;
          const key = JSON.stringify([name, event.type]);
          const terms = controlsBySubject.get(key);
          return terms?.size === 1 && terms.has(term.key);
        });
        for (const event of matches) used.add(event.id);
        row(block, item.subject, [
          item.forms.join(' · '),
          item.results.length ? 'Результаты · ' + item.results.join(', ') : '',
          ...matches.map(dateText),
          !matches.length && item.forms.length ? 'Дата в загруженном расписании отсутствует.' : '',
        ]);
      }
    }
    const remaining = events.filter(event => !used.has(event.id));
    if (remaining.length) {
      const block = section(root, 'Контрольные мероприятия из расписания', schedule.group);
      for (const event of remaining) row(block, event.title, [event.kind, dateText(event)]);
    }
    if (!root.childElementCount) root.append(node('p', 'В загруженном расписании группы пока нет контрольных мероприятий. Формы контроля можно загрузить из учебной траектории.', 'empty-state'));
    if (schedule.from && schedule.to) root.append(node('p', `Расписание ${schedule.group} · ${label(schedule.from)}–${label(schedule.to)}`, 'journal-meta'));
  }

  // ---------- One-click import from lks.siriusuniversity.ru ----------
  // Runs on the university site as a bookmarklet: it reads the three account pages
  // with the student's own session and hands only the needed fragments to the wiki.
  function bridge(wiki) {
    if (location.hostname !== 'lks.siriusuniversity.ru') {
      alert('Откройте lks.siriusuniversity.ru, войдите и нажмите закладку ещё раз.');
      return;
    }
    document.getElementById('sirius-wiki-bridge')?.remove();
    const box = document.createElement('div');
    box.id = 'sirius-wiki-bridge';
    box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;padding:18px;border-radius:22px;background:rgba(4,34,38,.92);backdrop-filter:blur(16px);color:#e8fbfa;font:14px/1.45 system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.35)';
    const text = document.createElement('p');
    text.style.margin = '0 0 12px';
    text.textContent = 'Собираем оценки из личного кабинета…';
    box.append(text);
    document.body.append(box);
    const names = { journal: ['/journal/list', 'journal-list'], trajectory: ['/student/trajectory', 'trajectory'], dashboard: ['/dashboard', 'user-notifications-menu'] };
    const pages = {};
    Promise.all(Object.entries(names).map(async ([key, [path, name]]) => {
      const html = await (await fetch(path, { credentials: 'same-origin' })).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const element = [...doc.querySelectorAll('[wire\\:initial-data]')].find(el => {
        try { return JSON.parse(el.getAttribute('wire:initial-data')).fingerprint.name === name; } catch { return false; }
      });
      if (!element) return;
      let out = element.outerHTML;
      if (key === 'dashboard') out += [...doc.querySelectorAll('a[href*="/news/show/"]')].map(a => a.outerHTML).join('');
      pages[key] = out;
    })).then(() => {
      const count = Object.keys(pages).length;
      text.textContent = count ? `Готово: ${count} из 3 разделов.` : 'Данных не нашли. Проверьте, что вы вошли в личный кабинет.';
      if (!count) return;
      const payload = { type: 'sirius-lk', pages, at: Date.now() };
      const button = (label, onClick) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'margin:0 8px 0 0;padding:10px 16px;border:0;border-radius:999px;background:#05dbd0;color:#032a30;font:600 14px system-ui,sans-serif;cursor:pointer';
        b.onclick = onClick;
        box.append(b);
      };
      button('Открыть в вики', () => {
        const target = window.open(wiki, '_blank');
        if (!target) { text.textContent = 'Браузер не открыл окно. Нажмите «Скопировать».'; return; }
        const origin = new URL(wiki).origin;
        let tries = 0;
        const timer = setInterval(() => { try { target.postMessage(payload, origin); } catch {} if (++tries > 40) clearInterval(timer); }, 500);
        addEventListener('message', event => {
          if (event.source !== target || event.data?.type !== 'sirius-lk-done') return;
          clearInterval(timer);
          text.textContent = event.data.ok ? 'Оценки в вики. Эту вкладку можно закрыть.' : 'Вики не смогла прочитать данные.';
        });
      });
      button('Скопировать', async () => {
        try { await navigator.clipboard.writeText(JSON.stringify(payload)); text.textContent = 'Скопировано. В вики нажмите «Вставить из буфера».'; }
        catch { text.textContent = 'Не получилось скопировать.'; }
      });
    }).catch(() => { text.textContent = 'Не удалось открыть страницы личного кабинета.'; });
  }
  const wikiAccountUrl = () => location.origin + location.pathname + '#/study/account';
  const bookmarklet = () => 'javascript:' + encodeURIComponent(`(${bridge.toString()})(${JSON.stringify(wikiAccountUrl())})`);

  const currentGroup = () => window.SiriusSchedule?.group?.() || '';
  let redraw = () => {};
  function importPages(pages) {
    const loaded = [], failed = [];
    for (const key of Object.keys(sources)) {
      if (typeof pages?.[key] !== 'string' || pages[key].length > 12 * 1024 * 1024) continue;
      try {
        data[key] = { value: readFile(pages[key], key), group: currentGroup(), at: Date.now() };
        revisions[key] = (revisions[key] || 0) + 1;
        loaded.push(key);
      } catch { failed.push(key); }
    }
    if (loaded.length) save();
    redraw();
    return { loaded, failed };
  }
  addEventListener('message', event => {
    if (event.origin !== origin || event.data?.type !== 'sirius-lk') return;
    const result = importPages(event.data.pages);
    event.source?.postMessage({ type: 'sirius-lk-done', ok: result.loaded.length > 0 }, origin);
  });

  // ---------- Overview ----------
  function scaleOf(marks) {
    const top = Math.max(0, ...marks.map(m => m.grade));
    return top <= 5 ? 5 : top <= 10 ? 10 : 100;
  }
  function tone(grade, scale) {
    const ratio = grade / scale;
    return ratio >= 0.85 ? 'a' : ratio >= 0.65 ? 'b' : ratio >= 0.45 ? 'c' : 'd';
  }
  const fmt = n => n.toLocaleString('ru', { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 1 : 0 });
  function chip(mark, scale) {
    const el = node('span', String(mark.grade), 'lk-grade g-' + tone(mark.grade, scale));
    el.title = entryDetails(mark);
    return el;
  }
  function metric(root, value, caption, extra = '') {
    const box = node('div', '', 'lk-metric' + (extra ? ' ' + extra : ''));
    box.append(node('strong', value), node('span', caption));
    root.append(box);
    return box;
  }
  function renderOverview(root) {
    const marks = data.journal?.value;
    if (!marks) {
      root.append(node('p', 'Подключите личный кабинет — здесь появятся средний балл, посещаемость и последние оценки.', 'empty-state'));
      return;
    }
    const graded = marks.filter(m => m.grade !== null);
    const scale = scaleOf(graded);
    const measured = marks.filter(m => m.absent !== null);
    const missed = measured.filter(m => m.absent).length;
    const average = graded.length ? graded.reduce((s, m) => s + m.grade, 0) / graded.length : null;
    const summary = node('div', '', 'lk-summary');
    const avgBox = metric(summary, average === null ? '—' : fmt(average), 'средний балл', average === null ? '' : 'is-lead g-' + tone(average, scale));
    avgBox.style.setProperty('--ratio', average === null ? 0 : (average / scale).toFixed(3));
    metric(summary, measured.length ? Math.round((measured.length - missed) / measured.length * 100) + '%' : '—', 'посещаемость');
    metric(summary, String(graded.length), 'оценок');
    metric(summary, String(missed), 'пропусков');
    root.append(summary);

    if (graded.length) {
      const counts = new Map();
      for (const m of graded) counts.set(m.grade, (counts.get(m.grade) || 0) + 1);
      const bar = node('div', '', 'lk-dist');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', 'Распределение оценок: ' + [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([g, c]) => `${g} — ${c}`).join(', '));
      for (const [g, c] of [...counts.entries()].sort((a, b) => b[0] - a[0])) {
        const seg = node('span', '', 'g-' + tone(g, scale));
        seg.style.flexGrow = c;
        seg.append(node('b', String(g)), node('i', String(c)));
        bar.append(seg);
      }
      root.append(bar);
    }

    const subjects = new Map();
    for (const m of marks) {
      if (!subjects.has(m.subject)) subjects.set(m.subject, []);
      subjects.get(m.subject).push(m);
    }
    const list = section(root, 'По предметам');
    list.classList.add('lk-subjects');
    const rows = [...subjects.entries()].map(([name, records]) => {
      const grades = records.filter(m => m.grade !== null);
      const avg = grades.length ? grades.reduce((s, m) => s + m.grade, 0) / grades.length : null;
      const seen = records.filter(m => m.absent !== null);
      const rate = seen.length ? Math.round(seen.filter(m => !m.absent).length / seen.length * 100) : null;
      return { name, grades, avg, rate };
    }).sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || a.name.localeCompare(b.name, 'ru'));
    for (const subject of rows) {
      const item = node('a', '', 'lk-subject');
      item.href = '#/study/account?tab=grades';
      const head = node('div', '', 'lk-subject-head');
      head.append(node('strong', subject.name));
      const avg = node('span', subject.avg === null ? '—' : fmt(subject.avg), 'lk-avg' + (subject.avg === null ? '' : ' g-' + tone(subject.avg, scale)));
      head.append(avg);
      const chips = node('div', '', 'lk-chips');
      for (const mark of subject.grades.slice(0, 10).reverse()) chips.append(chip(mark, scale));
      if (!subject.grades.length) chips.append(node('span', 'Оценок пока нет', 'journal-meta'));
      const meta = node('span', subject.rate === null ? '' : `посещаемость ${subject.rate}%`, 'lk-subject-meta');
      item.append(head, chips, meta);
      list.append(item);
    }

    const recent = graded.slice(0, 8);
    if (recent.length) {
      const block = section(root, 'Последние оценки');
      block.classList.add('lk-recent');
      for (const mark of recent) {
        const rowEl = node('div', '', 'lk-recent-row');
        const text = node('div');
        text.append(node('strong', mark.subject), node('span', [label(mark.date), mark.kind, mark.topic].filter(Boolean).join(' · ')));
        rowEl.append(chip(mark, scale), text);
        block.append(rowEl);
      }
    }
  }

  // Short summary for the home page.
  function summary() {
    const marks = data.journal?.value;
    if (!marks) return null;
    const graded = marks.filter(m => m.grade !== null);
    const scale = scaleOf(graded);
    const measured = marks.filter(m => m.absent !== null);
    return {
      average: graded.length ? graded.reduce((s, m) => s + m.grade, 0) / graded.length : null,
      attendance: measured.length ? Math.round(measured.filter(m => !m.absent).length / measured.length * 100) : null,
      latest: graded[0] || null,
      recent: graded.slice(0, 12).map(m => ({ grade: m.grade, subject: m.subject, date: m.date })),
      scale,
      tone: grade => tone(grade, scale),
      at: data.journal.at || null,
    };
  }

  function render(app, params, getSchedule) {
    const schedule = getSchedule();
    const tab = Object.hasOwn(tabs, params.get('tab')) ? params.get('tab') : 'overview';
    const connected = Object.keys(data).length > 0;
    app.innerHTML = `<section class="page student-account">
      <a class="journal-link journal-back" href="#/study">← Учёба</a>
      <div class="page-top lk-top"><h1>Личный кабинет</h1><p class="journal-meta" data-lk-updated></p></div>
      <nav class="journal-tabs" aria-label="Разделы личного кабинета"></nav>
      <details class="journal-import" ${connected ? '' : 'open'}>
        <summary>${connected ? 'Обновить данные из ЛК' : 'Подключить личный кабинет'}</summary>
        <ol class="lk-steps">
          <li><span>Перетащите кнопку в панель закладок. На телефоне скопируйте код и сохраните его как адрес новой закладки.</span>
            <div class="lk-step-actions"><a class="lk-bookmarklet" data-lk-bookmarklet>Оценки → Вики</a><button type="button" data-lk-copy>Скопировать код</button></div></li>
          <li><span>Откройте <a class="journal-link" href="${origin}/dashboard" target="_blank" rel="noopener noreferrer">lks.siriusuniversity.ru</a>, войдите и нажмите закладку.</span></li>
          <li><span>Нажмите «Открыть в вики». Если вики установлена как приложение на iPhone, выберите «Скопировать», а здесь — «Вставить из буфера».</span>
            <div class="lk-step-actions"><button type="button" data-lk-paste>Вставить из буфера</button></div></li>
        </ol>
        <p class="journal-meta" data-lk-status role="status"></p>
        <details class="lk-files">
          <summary>Загрузить сохранённые страницы вручную</summary>
          <p class="journal-meta">Группа в расписании: <strong></strong>. Сохраните раздел ЛК через «Сохранить как» в формате HTML и выберите файл.</p>
          <div data-journal-sources></div>
        </details>
        <div class="lk-privacy">
          <label><input type="checkbox" data-lk-remember ${remember() ? 'checked' : ''}> Хранить данные на этом устройстве</label>
          <button type="button" data-journal-clear>Удалить загруженные данные</button>
        </div>
        <p class="journal-meta">Пароль вводится только на сайте университета. Оценки никуда не отправляются и лежат в этом браузере.</p>
      </details>
      <label class="journal-semester" hidden>Семестр <select></select></label>
      <div data-journal-content></div>
    </section>`;
    const page = app.querySelector('.student-account');
    const content = page.querySelector('[data-journal-content]');
    const status = page.querySelector('[data-lk-status]');
    page.querySelector('.lk-files strong').textContent = schedule.group;
    const selectTerm = page.querySelector('.journal-semester select');
    for (const [key, title] of Object.entries(tabs)) {
      const item = link(title, '#/study/account?tab=' + key);
      if (key === tab) item.setAttribute('aria-current', 'page');
      page.querySelector('nav').append(item);
    }
    const mark = page.querySelector('[data-lk-bookmarklet]');
    mark.href = bookmarklet();
    mark.onclick = event => { event.preventDefault(); status.textContent = 'Эту кнопку нужно перетащить в закладки, а нажимать уже на сайте ЛК.'; };
    page.querySelector('[data-lk-copy]').onclick = async () => {
      try { await navigator.clipboard.writeText(decodeURIComponent(bookmarklet())); status.textContent = 'Код закладки скопирован.'; }
      catch { status.textContent = 'Не получилось скопировать. Перетащите кнопку в закладки.'; }
    };
    page.querySelector('[data-lk-paste]').onclick = async () => {
      try {
        const payload = JSON.parse(await navigator.clipboard.readText());
        if (payload?.type !== 'sirius-lk') throw new Error();
        const result = importPages(payload.pages);
        status.textContent = result.loaded.length ? `Загружено разделов: ${result.loaded.length}.` : 'В буфере нет данных ЛК.';
      } catch { status.textContent = 'В буфере нет данных из закладки. Скопируйте их на сайте ЛК ещё раз.'; }
    };
    page.querySelector('[data-lk-remember]').onchange = event => {
      storage.set(REMEMBER, String(event.target.checked));
      save();
      status.textContent = event.target.checked ? 'Данные будут храниться на этом устройстве.' : 'Данные удалятся, когда вы закроете вкладку.';
    };
    const draw = () => {
      if (!page.isConnected) return;
      const stamp = Math.max(0, ...Object.values(data).map(entry => entry.at || 0));
      page.querySelector('[data-lk-updated]').textContent = stamp ? 'Обновлено ' + new Date(stamp).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
      content.replaceChildren();
      selectTerm.parentElement.hidden = true;
      if (tab === 'overview') return renderOverview(content);
      if (tab === 'session') return renderSession(content, getSchedule(), selectTerm);
      if (tab !== 'news') return renderJournal(content, tab);
      const dashboard = data.dashboard?.value;
      if (!dashboard) {
        content.append(node('p', 'Подключите личный кабинет, чтобы видеть новости и уведомления.', 'empty-state'));
        return;
      }
      for (const [key, title] of [['notices', 'Уведомления'], ['news', 'Новости']]) {
        const block = section(content, title);
        for (const item of dashboard[key]) row(block, item.title, [item.text], item.url);
        if (!dashboard[key].length) block.append(node('p', 'Записей нет.', 'journal-meta'));
      }
    };
    selectTerm.onchange = () => { if (data.trajectory) { data.trajectory.semester = selectTerm.value; save(); } draw(); };
    const updates = page.querySelector('[data-journal-sources]');
    const clear = page.querySelector('[data-journal-clear]');
    const statuses = [];
    for (const [key, source] of Object.entries(sources)) {
      const block = node('div', '', 'journal-source');
      const input = node('input');
      input.type = 'file';
      input.accept = '.html,.htm,text/html';
      input.setAttribute('aria-label', source.title + ', загрузить HTML');
      const fileStatus = node('p', data[key] ? 'Данные загружены для ' + data[key].group : '', 'journal-meta');
      fileStatus.setAttribute('role', 'status');
      statuses.push(fileStatus);
      block.append(link(source.title + ' ↗', origin + source.path, true), input, fileStatus);
      updates.append(block);
      input.onchange = async () => {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        const revision = revisions[key] = (revisions[key] || 0) + 1;
        fileStatus.textContent = 'Читаем файл…';
        try {
          if (file.size > 12 * 1024 * 1024) throw new Error('Файл больше 12 МБ. Сохраните страницу в формате «Только HTML».');
          const value = readFile(await file.text(), key);
          if (!page.isConnected || revisions[key] !== revision) return;
          data[key] = { value, group: schedule.group, at: Date.now() };
          save();
          fileStatus.textContent = 'Данные загружены для ' + schedule.group;
          draw();
        } catch (error) {
          if (page.isConnected && revisions[key] === revision) fileStatus.textContent = error.message;
        }
      };
    }
    clear.onclick = () => {
      for (const key of Object.keys(sources)) { revisions[key] = (revisions[key] || 0) + 1; delete data[key]; }
      storage.drop(STORE);
      for (const s of statuses) s.textContent = '';
      status.textContent = 'Данные удалены.';
      draw();
    };
    redraw = () => {
      if (!page.isConnected) return;
      status.textContent = 'Данные из ЛК обновлены.';
      draw();
    };
    draw();
    refreshSession = () => { if (tab === 'session' && page.isConnected) draw(); };
  }

  window.SiriusStudentAccount = { render, lessonRecord, summary, refreshSchedule: () => refreshSession() };
})();
