(() => {
  const origin = 'https://lks.siriusuniversity.ru';
  const sources = {
    journal: { title: 'Электронный журнал', path: '/journal/list' },
    trajectory: { title: 'Учебная траектория', path: '/student/trajectory' },
    dashboard: { title: 'Главная ЛК', path: '/dashboard' },
  };
  const tabs = { grades: 'Оценки', visits: 'Посещаемость', homework: 'Домашние задания', news: 'Новости и уведомления', session: 'Сессия' };
  const data = {};
  const revisions = {};
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

  function render(app, params, getSchedule) {
    const schedule = getSchedule();
    const tab = Object.hasOwn(tabs, params.get('tab')) ? params.get('tab') : 'grades';
    app.innerHTML = `<section class="page student-account">
      <a class="journal-link" href="#/study">← Учёба</a>
      <div class="page-top"><h1>Личный кабинет</h1></div>
      <nav class="journal-tabs" aria-label="Разделы личного кабинета"></nav>
      <details class="journal-import" ${Object.keys(data).length ? '' : 'open'}>
        <summary>Загрузить данные из ЛК Сириуса</summary>
        <p class="journal-meta">Группа в расписании: <strong></strong>. Войдите на сайте университета и сохраните нужную страницу через «Сохранить как» в формате HTML. Выберите файл ниже. Данные читаются в этой вкладке и удаляются после её перезагрузки или закрытия.</p>
        <div data-journal-sources></div>
        <button type="button" data-journal-clear>Очистить загруженные данные</button>
      </details>
      <label class="journal-semester" hidden>Семестр <select></select></label>
      <div data-journal-content></div>
    </section>`;
    const page = app.querySelector('.student-account');
    const content = page.querySelector('[data-journal-content]');
    page.querySelector('.journal-import strong').textContent = schedule.group;
    const selectTerm = page.querySelector('select');
    for (const [key, title] of Object.entries(tabs)) {
      const item = link(title, '#/study/account?tab=' + key);
      if (key === tab) item.setAttribute('aria-current', 'page');
      page.querySelector('nav').append(item);
    }
    const draw = () => {
      content.replaceChildren();
      if (tab === 'session') return renderSession(content, getSchedule(), selectTerm);
      if (tab !== 'news') return renderJournal(content, tab);
      const dashboard = data.dashboard?.value;
      if (!dashboard) {
        content.append(node('p', 'Загрузите сохранённую главную страницу ЛК Сириуса.', 'empty-state'));
        return;
      }
      for (const [key, title] of [['notices', 'Уведомления'], ['news', 'Новости']]) {
        const block = section(content, title);
        for (const item of dashboard[key]) row(block, item.title, [item.text], item.url);
        if (!dashboard[key].length) block.append(node('p', 'На сохранённой странице нет записей.', 'journal-meta'));
      }
    };
    selectTerm.onchange = () => { if (data.trajectory) data.trajectory.semester = selectTerm.value; draw(); };
    const updates = page.querySelector('[data-journal-sources]');
    const clear = page.querySelector('[data-journal-clear]');
    const statuses = [];
    for (const [key, source] of Object.entries(sources)) {
      const block = node('div', '', 'journal-source');
      const input = node('input');
      input.type = 'file';
      input.accept = '.html,.htm,text/html';
      input.setAttribute('aria-label', source.title + ', загрузить HTML');
      const status = node('p', data[key] ? 'Данные загружены для ' + data[key].group : '', 'journal-meta');
      status.setAttribute('role', 'status');
      statuses.push(status);
      block.append(link(source.title + ' ↗', origin + source.path, true), input, status);
      updates.append(block);
      input.onchange = async () => {
        const file = input.files[0];
        input.value = '';
        if (!file) return;
        const revision = revisions[key] = (revisions[key] || 0) + 1;
        status.textContent = 'Читаем файл…';
        try {
          if (file.size > 12 * 1024 * 1024) throw new Error('Файл больше 12 МБ. Сохраните страницу в формате «Только HTML».');
          const value = readFile(await file.text(), key);
          if (!page.isConnected || revisions[key] !== revision) return;
          data[key] = { value, group: schedule.group };
          status.textContent = 'Данные загружены для ' + schedule.group;
          draw();
        } catch (error) {
          if (page.isConnected && revisions[key] === revision) status.textContent = error.message;
        }
      };
    }
    clear.onclick = () => {
      for (const key of Object.keys(sources)) { revisions[key] = (revisions[key] || 0) + 1; delete data[key]; }
      for (const status of statuses) status.textContent = '';
      draw();
    };
    draw();
    refreshSession = () => { if (tab === 'session' && page.isConnected) draw(); };
  }

  window.SiriusStudentAccount = { render, lessonRecord, refreshSchedule: () => refreshSession() };
})();
