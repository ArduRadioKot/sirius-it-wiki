(() => {
  const origin = 'https://lks.siriusuniversity.ru';
  const sources = {
    journal: { title: 'Электронный журнал', path: '/journal/list' },
    trajectory: { title: 'Учебная траектория', path: '/student/trajectory' },
    dashboard: { title: 'Главная ЛК', path: '/dashboard' },
  };
  const tabs = { overview: 'Обзор', grades: 'Оценки', visits: 'Посещаемость', homework: 'Домашние задания', news: 'Новости и уведомления', session: 'Сессия' };
  const data = {};
  const nativeAccount = window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.SiriusAccount;
  const personalSource = window.SiriusAccountSchedule;
  const personalChecked = new Map();
  const personalRequests = new Map();
  let personalRevision = 0;
  let personalNeedsLogin = false;
  let nativeSync = null;
  let nativeMessage = '';
  let nativeNeedsLogin = false;
  let nativeClearing = false;
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
    if (demo) return;
    if (nativeAccount) {
      storage.drop(STORE);
      const value = remember() && Object.keys(data).length ? JSON.stringify(data) : '';
      nativeAccount.saveCache({ value }).catch(() => {
        nativeMessage = 'Данные открыты, но не удалось обновить офлайн-копию.';
        redraw();
      });
      return;
    }
    if (!remember() || !Object.keys(data).length) return storage.drop(STORE);
    storage.set(STORE, JSON.stringify(data));
  }
  function restore(saved) {
    if (Array.isArray(saved?.journal?.value)) data.journal = saved.journal;
    if (Array.isArray(saved?.trajectory?.value)) data.trajectory = saved.trajectory;
    if (Array.isArray(saved?.dashboard?.value?.news)) data.dashboard = saved.dashboard;
    if (personalSource && saved?.schedule && typeof saved.schedule === 'object') {
      const weeks = Object.values(saved.schedule).filter(item => item && personalSource.week(item.from)?.to === item.to && Array.isArray(item.rows));
      if (weeks.length) data.schedule = Object.fromEntries(weeks.map(item => [item.from, item]));
    }
  }
  const cacheReady = nativeAccount ? nativeAccount.loadCache().then(({ value }) => {
    if (remember() && value && !Object.keys(data).length && !demo) restore(JSON.parse(value));
    redraw();
    if (location.hash.startsWith('#/schedule')) window.SiriusSchedule?.render();
  }).catch(() => {
    nativeMessage = 'Не удалось открыть сохранённую копию ЛК.';
    redraw();
  }) : Promise.resolve();
  if (!nativeAccount) {
    try { if (remember()) restore(JSON.parse(storage.get(STORE) || 'null')); } catch {}
  }
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

  function updatePersonalWeek(period, result) {
    if (!result && !data.schedule?.[period.from]) return;
    const weeks = { ...data.schedule };
    if (result) weeks[period.from] = { ...result, at: Date.now() };
    else delete weeks[period.from];
    const latest = Object.values(weeks).sort((a, b) => b.at - a.at).slice(0, 8);
    if (latest.length) data.schedule = Object.fromEntries(latest.map(item => [item.from, item]));
    else delete data.schedule;
    save();
    window.SiriusSchedule?.personalChanged?.();
  }

  function resetPersonalSchedule({ persist = true } = {}) {
    personalRevision++;
    personalChecked.clear();
    personalRequests.clear();
    if (!data.schedule) return;
    delete data.schedule;
    if (persist) save();
    window.SiriusSchedule?.personalChanged?.();
  }

  function refreshPersonalWeek(period, force = false) {
    if (!personalSource || !nativeAccount?.personalSchedule || !navigator.onLine || demo || nativeClearing || personalNeedsLogin) return;
    if (personalRequests.has(period.from)) return personalRequests.get(period.from);
    if (!force && Date.now() - (personalChecked.get(period.from) || 0) < 15 * 60_000) return;
    personalChecked.set(period.from, Date.now());
    const revision = personalRevision;
    const request = cacheReady.then(async () => {
      if (revision !== personalRevision || personalNeedsLogin || nativeClearing) return;
      try {
        const { calendar } = await nativeAccount.personalSchedule(period);
        if (revision === personalRevision) updatePersonalWeek(period, personalSource.parse(calendar, period));
      } catch (error) {
        if (revision !== personalRevision) return;
        if (error.code === 'LOGIN_REQUIRED') {
          personalNeedsLogin = true;
          resetPersonalSchedule();
        } else if (navigator.onLine) {
          updatePersonalWeek(period, null);
        }
      }
    }).finally(() => {
      if (personalRequests.get(period.from) === request) personalRequests.delete(period.from);
    });
    personalRequests.set(period.from, request);
    return request;
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
  // Runs on the university site as a bookmarklet: it reads the account pages
  // with the student's own session and hands only the needed fragments to the wiki.
  function bridge(wiki) {
    if (location.origin !== 'https://lks.siriusuniversity.ru') {
      alert('Откройте lks.siriusuniversity.ru, войдите и нажмите закладку ещё раз.');
      return;
    }
    document.getElementById('sirius-wiki-bridge')?.remove();
    const box = document.createElement('div');
    box.id = 'sirius-wiki-bridge';
    box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;padding:18px;border-radius:22px;background:rgba(4,34,38,.92);backdrop-filter:blur(16px);color:#e8fbfa;font:14px/1.45 system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.35)';
    const text = document.createElement('p');
    text.style.margin = '0 0 12px';
    text.textContent = 'Собираем данные из личного кабинета…';
    box.append(text);
    document.body.append(box);
    const names = { journal: ['/journal/list', 'journal-list'], trajectory: ['/student/trajectory', 'trajectory'], dashboard: ['/dashboard', 'user-notifications-menu'] };
    const pages = {};
    const jobs = Object.entries(names).map(async ([key, [path, name]]) => {
      const html = await (await fetch(path, { credentials: 'same-origin' })).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const element = [...doc.querySelectorAll('[wire\\:initial-data]')].find(el => {
        try { return JSON.parse(el.getAttribute('wire:initial-data')).fingerprint.name === name; } catch { return false; }
      });
      if (!element) return;
      let out = element.outerHTML;
      if (key === 'dashboard') out += [...doc.querySelectorAll('a[href*="/news/show/"]')].map(a => a.outerHTML).join('');
      pages[key] = out;
    });
    let personal;
    jobs.push((async () => {
      const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(Date.now());
      const day = new Date(today + 'T12:00:00Z');
      day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
      const from = day.toISOString().slice(0, 10);
      day.setUTCDate(day.getUTCDate() + 6);
      const period = { from, to: day.toISOString().slice(0, 10) };
      const params = new URLSearchParams({ ...period, lectures: 0, seminars: 0, practices: 0, laboratories: 0, exams: 0, other: 0 });
      const result = await fetch('/schedule/export/students?' + params, { credentials: 'same-origin', cache: 'no-store' });
      if (!result.ok) return;
      const calendar = await result.text();
      if (/^\s*BEGIN:VCALENDAR/i.test(calendar) && calendar.length <= 2 * 1024 * 1024) personal = { period, calendar };
    })());
    Promise.allSettled(jobs).then(() => {
      const count = Object.keys(pages).length + Number(Boolean(personal));
      text.textContent = count ? 'Готово. Можно открыть данные в вики.' : 'Данных не нашли. Проверьте, что вы вошли в личный кабинет.';
      if (!count) return;
      const payload = { type: 'sirius-lk', pages, personal, at: Date.now() };
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
          text.textContent = event.data.ok ? 'Данные в вики. Эту вкладку можно закрыть.' : 'Вики не смогла прочитать данные.';
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
  function importPages(pages, { replace = false } = {}) {
    if (demo) stopDemo();
    const loaded = [], failed = [];
    const incoming = {};
    for (const key of Object.keys(sources)) {
      if (typeof pages?.[key] !== 'string' || pages[key].length > 12 * 1024 * 1024) continue;
      try {
        incoming[key] = { value: readFile(pages[key], key), group: currentGroup(), at: Date.now() };
        revisions[key] = (revisions[key] || 0) + 1;
        loaded.push(key);
      } catch { failed.push(key); }
    }
    if (replace && !loaded.includes('journal')) return { loaded: [], failed };
    if (replace) for (const key of Object.keys(sources)) delete data[key];
    Object.assign(data, incoming);
    if (loaded.length) save();
    redraw();
    return { loaded, failed };
  }
  function importTransfer(payload) {
    const grades = importPages(payload.pages).loaded.length > 0;
    const period = payload.personal?.period;
    const week = personalSource?.parse(payload.personal?.calendar, period);
    if (week) {
      window.SiriusSchedule?.preferPersonal?.();
      updatePersonalWeek(period, week);
    }
    if (grades || week) redraw();
    return grades || Boolean(week);
  }
  addEventListener('message', event => {
    if (nativeAccount || event.origin !== origin || event.data?.type !== 'sirius-lk') return;
    event.source?.postMessage({ type: 'sirius-lk-done', ok: importTransfer(event.data) }, origin);
  });

  function syncAndroid(signIn = false) {
    if (nativeClearing || nativeSync) return nativeSync;
    nativeMessage = signIn ? 'Открываем вход в ЛК…' : 'Обновляем данные…';
    nativeSync = (async () => {
      await cacheReady;
      try {
        const { pages } = await (signIn ? nativeAccount.signIn() : nativeAccount.refresh());
        if (signIn) {
          for (const key of Object.keys(sources)) delete data[key];
          resetPersonalSchedule({ persist: false });
          window.SiriusSchedule?.preferPersonal?.();
        }
        personalNeedsLogin = false;
        window.SiriusSchedule?.refreshPersonal?.(true);
        const result = importPages(pages, { replace: true });
        if (!result.loaded.length) {
          if (signIn) save();
          throw new Error('ЛК вернул страницу в неизвестном формате.');
        }
        nativeNeedsLogin = false;
        nativeMessage = result.loaded.length === Object.keys(sources).length
          ? 'Данные ЛК обновлены.' : 'Журнал обновлён. Некоторые разделы ЛК пока недоступны.';
        if (location.hash.startsWith('#/schedule')) window.SiriusSchedule?.render();
      } catch (error) {
        if (error.code === 'LOGIN_REQUIRED') {
          personalNeedsLogin = true;
          resetPersonalSchedule();
        }
        nativeNeedsLogin = error.code === 'LOGIN_REQUIRED' || nativeNeedsLogin;
        nativeMessage = error.message || 'Не удалось обновить данные.';
        if (Object.keys(data).length) nativeMessage += ' Показана сохранённая копия.';
      }
    })().finally(() => {
      nativeSync = null;
      redraw();
    });
    redraw();
    return nativeSync;
  }

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
      root.append(node('p', 'В загруженных данных нет электронного журнала. Обновите оценки из ЛК.', 'empty-state'));
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
      item.href = '#/study/account?tab=grades' + (demo ? '&demo=1' : '');
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

  // ---------- Saved pages: plain HTML, Chrome's MHTML and Safari's web archive ----------
  async function fileText(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text = new TextDecoder('utf-8').decode(bytes);
    if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(text.slice(0, 200000))) {
      // MHTML keeps the page quoted-printable: "=\n" soft breaks and "=3D" style bytes.
      const source = text.replace(/=\r?\n/g, '');
      const out = new Uint8Array(source.length);
      let length = 0;
      const encoder = new TextEncoder();
      for (let i = 0; i < source.length; i++) {
        const hex = source[i] === '=' ? source.slice(i + 1, i + 3) : '';
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) { out[length++] = parseInt(hex, 16); i += 2; }
        else if (source.charCodeAt(i) < 128) out[length++] = source.charCodeAt(i);
        else for (const byte of encoder.encode(source[i])) out[length++] = byte;
      }
      text = new TextDecoder('utf-8').decode(out.subarray(0, length));
    }
    return text;
  }
  function importFileText(text) {
    const loaded = [];
    for (const key of Object.keys(sources)) {
      let value;
      try { value = readFile(text, key); } catch { continue; }
      // The notifications menu sits on every page; keep it only from the dashboard itself.
      if (key === 'dashboard' && !value.news.length && (loaded.length || data.dashboard)) continue;
      data[key] = { value, group: currentGroup(), at: Date.now() };
      revisions[key] = (revisions[key] || 0) + 1;
      loaded.push(key);
    }
    if (replace && !loaded.includes('journal')) return { loaded: [], failed };
    if (replace) for (const key of Object.keys(sources)) delete data[key];
    Object.assign(data, incoming);
    if (loaded.length) save();
    return loaded;
  }

  // ---------- Example data, so the page explains itself before the account is connected ----------
  let demo = false;
  function startDemo() {
    const subjects = ['Математический анализ', 'Линейная алгебра', 'Алгоритмы и структуры данных', 'Физика', 'История России'];
    const grades = [5, 4, 5, 3, 4, 5, 5, 4, 2, 5];
    const marks = [];
    const day = 86400000, start = Date.now();
    for (let i = 0; i < 36; i++) {
      const date = new Date(start - i * day * 0.8).toISOString().slice(0, 10);
      marks.push({
        subject: subjects[i % subjects.length], date, time: 620, kind: i % 2 ? 'Лекции' : 'Практические занятия',
        grade: i % 3 === 2 ? null : grades[i % grades.length], absent: i % 11 === 5,
        topic: 'Тема занятия ' + (36 - i), homework: i % 5 === 0 ? 'Задачи к следующему занятию' : '',
      });
    }
    data.journal = { value: marks, group: currentGroup(), at: Date.now() };
    data.dashboard = { value: { notices: [{ title: 'Новая оценка в журнале', text: 'Линейная алгебра' }], news: [] }, group: currentGroup(), at: Date.now() };
    demo = true;
  }
  function stopDemo() {
    if (!demo) return;
    demo = false;
    for (const key of Object.keys(sources)) delete data[key];
  }

  const ua = String(navigator.userAgent || '');
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
  let device = isIOS ? 'ios' : isAndroid ? 'android' : 'desktop';
  const devices = { ios: 'iPhone', android: 'Android', desktop: 'Компьютер' };

  function steps() {
    const open = `<a class="lk-button" href="${origin}/dashboard" target="_blank" rel="noopener noreferrer">Открыть ЛК</a>`;
    const copy = '<button type="button" class="lk-button is-primary" data-lk-copy>Скопировать код</button>';
    const paste = '<button type="button" class="lk-button" data-lk-paste>Вставить из буфера</button>';
    const last = isIOS && standalone()
      ? ['В окошке на сайте ЛК нажмите «Скопировать», вернитесь сюда и вставьте данные.', paste.replace('lk-button"', 'lk-button is-primary"')]
      : ['В окошке на сайте ЛК нажмите «Открыть в вики» — оценки появятся на этой странице. Если вики не открылась, нажмите там «Скопировать», вернитесь сюда и вставьте данные.', paste];
    if (device === 'desktop') return [
      ['Перетащите кнопку на панель закладок браузера. Панель показывается по Ctrl+Shift+B, на Mac — ⌘+Shift+B.', '<a class="lk-button is-primary lk-bookmarklet" data-lk-bookmarklet>Оценки → Вики</a>'],
      ['Откройте ЛК, войдите и нажмите эту закладку.', open],
      last,
    ];
    if (device === 'ios') return [
      ['Скопируйте код закладки.', copy],
      ['В Safari нажмите «Поделиться» → «Добавить закладку» и сохраните. Затем откройте «Закладки» → «Править», выберите её и вставьте код вместо адреса.', ''],
      ['Откройте ЛК в Safari, войдите, откройте «Закладки» и нажмите сохранённую.', open],
      last,
    ];
    return [
      ['Скопируйте код закладки.', copy],
      ['В Chrome нажмите ⋮ → ☆, затем ⋮ → «Закладки» → ⋮ у новой закладки → «Изменить». Назовите её «вики» и вставьте код в поле адреса.', ''],
      ['Откройте ЛК, войдите, нажмите на адресную строку, наберите «вики» и выберите строку со звёздочкой.', open],
      last,
    ];
  }

  function render(app, params, getSchedule) {
    const schedule = getSchedule();
    const tab = Object.hasOwn(tabs, params.get('tab')) ? params.get('tab') : 'overview';
    if (demo && params.get('demo') !== '1') stopDemo();
    const connected = () => Object.keys(data).length > 0;
    app.innerHTML = `<section class="page student-account">
      <a class="back-link" href="#/study"><span class="icon icon-arrow-left" aria-hidden="true"></span>Учёба</a>
      <header class="lk-head">
        <div><h1>Личный кабинет</h1><p class="journal-meta" data-lk-updated></p></div>
        <button type="button" class="lk-button" data-lk-refresh hidden>Обновить оценки</button>
      </header>
      <div class="lk-demo" data-lk-demo-bar hidden>
        <span>Это пример с выдуманными оценками.</span>
        <button type="button" class="lk-button is-primary" data-lk-demo-stop>Подключить свой ЛК</button>
      </div>
      <section class="lk-connect" data-lk-connect hidden>
        <h2 data-lk-connect-title></h2>
        ${nativeAccount ? `<p class="lk-lead">Войдите на официальной странице Сириуса. Вики загрузит персональное расписание, журнал, учебную траекторию и уведомления. Сохранённые данные доступны без сети.</p>
        <button type="button" class="lk-button is-primary" data-native-login>Войти в ЛК</button>
        <div class="lk-connect-foot" data-lk-connect-foot></div>` : `<p class="lk-lead">Сайт ЛК не отдаёт оценки другим сайтам, поэтому их переносит закладка в вашем браузере. Пароль вы вводите только на lks.siriusuniversity.ru, оценки остаются на этом устройстве.</p>
        <div class="lk-devices" role="group" aria-label="Устройство"></div>
        <ol class="lk-steps"></ol>
        <p class="lk-status" data-lk-status role="status"></p>
        <details class="lk-files">
          <summary>Не получается? Загрузите страницу файлом</summary>
          <p class="journal-meta">Войдите в ЛК и сохраните страницу «Электронный журнал»: на компьютере — «Сохранить как», на iPhone — «Поделиться» → «Параметры» → «Веб-архив» → «Сохранить в Файлы». Затем выберите файл здесь. Так же можно добавить «Учебную траекторию» и главную ЛК.</p>
          <input type="file" multiple accept=".html,.htm,.mhtml,.mht,.webarchive,text/html" aria-label="Сохранённые страницы ЛК">
        </details>
        <div class="lk-connect-foot" data-lk-connect-foot></div>`}
      </section>
      ${nativeAccount ? '<p class="lk-status" data-lk-status role="status"></p>' : ''}
      <nav class="journal-tabs" aria-label="Разделы личного кабинета" hidden></nav>
      <label class="journal-semester" hidden>Семестр <select></select></label>
      <div data-journal-content></div>
      <details class="lk-data" data-lk-data hidden>
        <summary>Данные на этом устройстве</summary>
        <label><input type="checkbox" data-lk-remember ${remember() ? 'checked' : ''}> Хранить данные ЛК на этом устройстве</label>
        <p class="journal-meta">${nativeAccount ? 'Если выключить, данные будут доступны до закрытия приложения.' : 'Если выключить, данные пропадут после закрытия вкладки.'}</p>
        <button type="button" class="lk-button" data-journal-clear>${nativeAccount ? 'Отключить ЛК и удалить данные' : 'Удалить данные ЛК с устройства'}</button>
      </details>
    </section>`;
    const page = app.querySelector('.student-account');
    const $ = selector => page.querySelector(selector);
    const content = $('[data-journal-content]');
    const status = $('[data-lk-status]');
    const connect = $('[data-lk-connect]');
    const nav = $('.journal-tabs');
    const selectTerm = $('.journal-semester select');
    let connectOpen = false;
    for (const [key, title] of Object.entries(tabs)) {
      const item = link(title, '#/study/account?tab=' + key + (demo ? '&demo=1' : ''));
      if (key === tab) item.setAttribute('aria-current', 'page');
      nav.append(item);
    }
    nav.querySelector('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });

    function drawSteps() {
      const box = $('.lk-devices');
      box.replaceChildren();
      for (const [key, title] of Object.entries(devices)) {
        const button = node('button', title);
        button.type = 'button';
        button.setAttribute('aria-pressed', String(key === device));
        button.onclick = () => { device = key; drawSteps(); };
        box.append(button);
      }
      $('.lk-steps').innerHTML = steps().map(([text, action]) => `<li><span>${text}</span>${action ? `<div class="lk-step-action">${action}</div>` : ''}</li>`).join('');
      const mark = $('[data-lk-bookmarklet]');
      if (mark) {
        mark.href = bookmarklet();
        mark.onclick = event => { event.preventDefault(); status.textContent = 'Кнопку нужно перетащить в закладки, а нажимать — уже на сайте ЛК.'; };
      }
      const copy = $('[data-lk-copy]');
      if (copy) copy.onclick = async () => {
        try { await navigator.clipboard.writeText(decodeURIComponent(bookmarklet())); status.textContent = 'Код скопирован. Теперь создайте закладку и вставьте его вместо адреса.'; }
        catch { status.textContent = 'Браузер не дал скопировать код. Откройте вики в Safari или Chrome и попробуйте ещё раз.'; }
      };
      const paste = $('[data-lk-paste]');
      const accept = text => {
        let payload;
        try { payload = JSON.parse(text); } catch { payload = null; }
        if (payload?.type !== 'sirius-lk') { status.textContent = 'Это не данные из закладки. Нажмите «Скопировать» на сайте ЛК и вставьте ещё раз.'; return; }
        if (!importTransfer(payload)) status.textContent = 'В скопированных данных ничего не нашлось. Откройте ЛК и запустите закладку ещё раз.';
      };
      if (paste) paste.onclick = async () => {
        try { accept(await navigator.clipboard.readText()); }
        catch {
          // Some browsers do not let a page read the clipboard: offer a field to paste into by hand.
          if (!paste.parentElement.querySelector('textarea')) {
            const field = node('textarea', '', 'lk-paste-field');
            field.rows = 3;
            field.placeholder = 'Вставьте скопированные данные сюда';
            field.setAttribute('aria-label', 'Данные из закладки');
            field.oninput = () => { if (field.value.trim()) accept(field.value); };
            paste.parentElement.append(field);
            field.focus();
          }
          status.textContent = 'Браузер не дал прочитать буфер. Вставьте данные в поле вручную.';
        }
      };
    }

    const draw = () => {
      if (!page.isConnected) return;
      const ready = connected();
      const stamp = demo ? 0 : Math.max(0, ...Object.values(data).map(entry => entry.at || 0));
      $('[data-lk-updated]').textContent = stamp ? 'Обновлено ' + new Date(stamp).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
      $('[data-lk-demo-bar]').hidden = !demo;
      $('[data-lk-refresh]').hidden = !ready || demo;
      $('[data-lk-refresh]').textContent = connectOpen ? 'Скрыть' : 'Обновить оценки';
      if (nativeAccount) {
        const refresh = $('[data-lk-refresh]');
        refresh.textContent = nativeNeedsLogin ? 'Войти снова' : 'Обновить оценки';
        refresh.disabled = Boolean(nativeSync) || nativeClearing;
        $('[data-native-login]').disabled = Boolean(nativeSync) || nativeClearing;
        $('[data-journal-clear]').disabled = Boolean(nativeSync) || nativeClearing;
        status.textContent = nativeMessage;
      }
      $('[data-lk-data]').hidden = !ready || demo;
      connect.hidden = ready && !connectOpen;
      $('[data-lk-connect-title]').textContent = ready ? 'Обновить оценки' : 'Подключите ЛК, чтобы видеть оценки';
      const foot = $('[data-lk-connect-foot]');
      foot.replaceChildren();
      if (!ready) {
        const example = node('button', 'Посмотреть на примере', 'lk-button');
        example.type = 'button';
        example.onclick = () => { startDemo(); location.hash = '#/study/account?demo=1'; };
        foot.append(example);
      }
      nav.hidden = !ready;
      content.replaceChildren();
      selectTerm.parentElement.hidden = true;
      if (!ready) return;
      if (tab === 'overview') return renderOverview(content);
      if (tab === 'session') return renderSession(content, getSchedule(), selectTerm);
      if (tab !== 'news') return renderJournal(content, tab);
      const dashboard = data.dashboard?.value;
      if (!dashboard) {
        content.append(node('p', 'Новости и уведомления появятся после следующего обновления из ЛК.', 'empty-state'));
        return;
      }
      for (const [key, title] of [['notices', 'Уведомления'], ['news', 'Новости']]) {
        const block = section(content, title);
        for (const item of dashboard[key]) row(block, item.title, [item.text], item.url);
        if (!dashboard[key].length) block.append(node('p', 'Записей нет.', 'journal-meta'));
      }
    };

    $('[data-lk-refresh]').onclick = () => { if (nativeAccount) return syncAndroid(nativeNeedsLogin); connectOpen = !connectOpen; draw(); if (connectOpen) connect.scrollIntoView({ block: 'nearest' }); };
    $('[data-lk-demo-stop]').onclick = () => { stopDemo(); location.hash = '#/study/account'; };
    $('[data-lk-remember]').onchange = event => { storage.set(REMEMBER, String(event.target.checked)); save(); };
    if (nativeAccount) $('[data-native-login]').onclick = () => syncAndroid(true);
    $('[data-journal-clear]').onclick = async () => {
      if (nativeAccount) {
        if (nativeClearing || nativeSync) return;
        nativeClearing = true;
        draw();
        try { await nativeAccount.clear(); }
        catch {
          nativeMessage = 'Не удалось отключить ЛК.';
          return;
        } finally {
          nativeClearing = false;
          draw();
        }
        nativeMessage = 'ЛК отключён. Данные удалены с устройства.';
        nativeNeedsLogin = false;
      }
      for (const key of Object.keys(sources)) { revisions[key] = (revisions[key] || 0) + 1; delete data[key]; }
      personalNeedsLogin = Boolean(nativeAccount);
      resetPersonalSchedule({ persist: false });
      storage.drop(STORE);
      connectOpen = false;
      draw();
      if (!nativeAccount) status.textContent = 'Оценки удалены с этого устройства.';
    };
    selectTerm.onchange = () => { if (data.trajectory) { data.trajectory.semester = selectTerm.value; save(); } draw(); };
    const input = $('.lk-files input');
    if (input) input.onchange = async () => {
      const files = [...input.files];
      input.value = '';
      if (!files.length) return;
      if (demo) stopDemo();
      status.textContent = 'Читаем файл…';
      const loaded = new Set();
      for (const file of files) {
        if (file.size > 20 * 1024 * 1024) continue;
        try { for (const key of importFileText(await fileText(file))) loaded.add(key); } catch {}
      }
      if (!page.isConnected) return;
      if (demo === false && loaded.size) connectOpen = false;
      draw();
      status.textContent = loaded.size
        ? 'Загружено: ' + [...loaded].map(key => sources[key].title).join(', ') + '.'
        : 'В файле нет данных ЛК. Сохраните страницу после входа в личный кабинет.';
    };
    redraw = () => {
      if (!page.isConnected) return;
      connectOpen = false;
      if (location.hash.includes('demo=1')) { location.hash = '#/study/account'; return; }
      draw();
    };
    if (nativeAccount) {
      cacheReady.then(() => {
        const at = data.journal?.at;
        if (page.isConnected && !demo && !nativeNeedsLogin && at && Date.now() - at > 15 * 60_000 && navigator.onLine) syncAndroid();
      });
    } else drawSteps();
    draw();
    refreshSession = () => { if (tab === 'session' && page.isConnected) draw(); };
  }

  window.SiriusStudentAccount = {
    render,
    lessonRecord: (slot, group) => demo ? [] : lessonRecord(slot, group),
    summary: () => demo ? null : summary(),
    refreshSchedule: () => refreshSession(),
    personalWeeks: () => !demo && data.schedule,
    refreshPersonalWeek,
  };
})();
