(() => {
  const GROUPS = ['ИОП-ИТ-26/1', 'ИОП-ИТ-26/2', 'ИОП-ИТ-25/1', 'ИОП-ИТ-25/2'];
  const base = new URL('./', document.currentScript.src);
  const get = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  const put = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  const escape = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Moscow'}).format(new Date());
  const instant = (e, field = 'start') => new Date(`${e.date}T${e[field]}:00+03:00`).getTime();
  let group = get('sirius-group', GROUPS[0]);
  if (!GROUPS.includes(group)) group = GROUPS[0];
  let date = today(), snapshot = null, loading = false, failure = false, notificationError = '';
  let lead = Number(get('sirius-lead', '10'));
  if (![5,10,15,30].includes(lead)) lead = 10;
  let enabled = get('sirius-reminders', 'false') === 'true';
  const valid = d => d?.version === 1 && Number.isFinite(Date.parse(d.updatedAt)) && /^\d{4}-\d{2}-\d{2}$/.test(d.fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(d.toDate) && GROUPS.some(g => Array.isArray(d.groups?.[g])) && GROUPS.every(g => d.groups?.[g] === undefined || (Array.isArray(d.groups[g]) && d.groups[g].every(e => typeof e.id === 'string' && typeof e.title === 'string' && Number.isFinite(instant(e)) && instant(e, 'end') > instant(e))));
  try { const saved = JSON.parse(get('sirius-schedule', 'null')); if (valid(saved)) snapshot = saved; } catch {}
  try {
    const packed = typeof window !== 'undefined' ? String(window.name || '') : '';
    if (packed.startsWith('sirius-schedule:')) {
      window.name = '';
      const incoming = JSON.parse(packed.slice('sirius-schedule:'.length));
      if (valid(incoming) && (!snapshot || Date.parse(incoming.updatedAt) >= Date.parse(snapshot.updatedAt))) {
        snapshot = incoming;
        put('sirius-schedule', JSON.stringify(incoming));
        put('sirius-schedule-origin', 'device');
      }
    }
  } catch {}
  const lessons = () => snapshot?.groups[group] || [];
  const active = () => location.hash.startsWith('#/schedule');
  const fresh = () => snapshot && Date.now() - Date.parse(snapshot.updatedAt) < 24 * 3600000;
  const completeSnapshot = () => GROUPS.every((g) => Array.isArray(snapshot?.groups[g]));
  const nextText = () => {
    if (!snapshot?.groups[group]) return ['Расписание загружается', 'Нужен интернет для первой загрузки'];
    if (today() < snapshot.fromDate || today() > snapshot.toDate) return ['Нужно обновить расписание', 'Сохранённый период не включает сегодня'];
    const now = Date.now(), ongoing = lessons().filter(e => instant(e) <= now && instant(e, 'end') > now);
    if (ongoing.length) return [`До конца пары ${Math.ceil((instant(ongoing[0], 'end') - now)/60000)} мин`, [...new Set(ongoing.map(e => e.title))].join(' / ')];
    const next = lessons().find(e => instant(e) > now);
    if (!next) return ['Пар больше нет', 'В сохранённом периоде'];
    const minutes = Math.ceil((instant(next) - now)/60000), days = Math.floor(minutes/1440), hours = Math.floor(minutes%1440/60);
    return [`До пары ${days ? days + ' д ' : ''}${hours ? hours + ' ч ' : ''}${minutes%60} мин`, `${next.title} · ${next.date === today() ? 'сегодня' : next.date} в ${next.start}`];
  };
  const UPDATE_INTERVAL = 4 * 60 * 60 * 1000;
  const isLocalHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
    hostname === '::1' || hostname === '[::1]' || (typeof hostname === 'string' && hostname.endsWith('.local')) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
  const canScrape = () => Boolean(window.SiriusSource);
  const localCollector = () => canScrape() && isLocalHost(location.hostname);
  let deviceLoading = false;
  let lastDeviceAttempt = Number(get('sirius-device-attempt', '0')) || 0;
  let deviceMessage = '';
  let deviceFailed = false;
  let calendarMessage = '';
  const ua = String(navigator.userAgent || '');
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isMobile = isIOS || /Android|Mobi/i.test(ua);
  const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return navigator.standalone === true; } };
  function showDeviceMessage(text) {
    deviceMessage = text;
    document.querySelectorAll('[data-device-status]').forEach((el) => { el.textContent = text; });
  }
  function acceptDevice(data) {
    if (!window.SiriusSource?.valid(data, true)) throw new Error('Файл не содержит корректного расписания четырёх групп.');
    if (snapshot && Date.parse(data.updatedAt) < Date.parse(snapshot.updatedAt)) throw new Error('В приложении уже есть более новое расписание.');
    try { localStorage.setItem('sirius-schedule', JSON.stringify(data)); }
    catch { throw new Error('Не удалось сохранить расписание. Освободите место в хранилище браузера.'); }
    snapshot = data; failure = false; deviceFailed = false;
    put('sirius-schedule-origin', 'device');
    showDeviceMessage('Расписание сохранено на устройстве.');
    if (active()) render();
    tick();
  }
  async function importDeviceFile(file) {
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Файл слишком большой. Максимум — 2 МБ.');
      let data; try { data = JSON.parse(await file.text()); } catch { throw new Error('Нужен JSON-файл расписания.'); }
      acceptDevice(data);
    } catch (error) {
      deviceFailed = true;
      showDeviceMessage(error.message);
      if (active()) render();
    }
  }
  function pickDeviceFile() { document.getElementById('deviceFile')?.click(); }
  async function refreshDevice(force = false, { quiet = false } = {}) {
    if (!window.SiriusSource) {
      if (!quiet) {
        deviceFailed = true;
        showDeviceMessage('Модуль загрузки не готов. Обновите страницу.');
        if (active()) render();
      }
      return false;
    }
    if (deviceLoading || !navigator.onLine) return false;
    if (!force) {
      const elapsed = Date.now() - lastDeviceAttempt;
      if (lastDeviceAttempt && elapsed >= 0 && elapsed < UPDATE_INTERVAL) return false;
      if (completeSnapshot() && Date.now() - Date.parse(snapshot.updatedAt) < 5 * 3600000) return false;
    }
    deviceLoading = true;
    deviceFailed = false;
    lastDeviceAttempt = Date.now(); put('sirius-device-attempt', String(lastDeviceAttempt));
    const hide = quiet && snapshot;
    if (!hide) {
      showDeviceMessage('Загружаем расписание…');
      if (active()) render();
    }
    try {
      acceptDevice(await window.SiriusSource.collect({progress: hide ? () => {} : showDeviceMessage}));
      return true;
    } catch {
      if (!hide) {
        deviceFailed = true;
        showDeviceMessage('Сайт расписания недоступен этому приложению. Можно выбрать JSON-файл.');
      }
      return false;
    } finally {
      deviceLoading = false;
      if (active()) render();
    }
  }
  window.addEventListener('message', (event) => {
    if (event.origin !== 'https://schedule.siriusuniversity.ru') return;
    if (event.data?.type !== 'sirius-schedule' || !event.data.data) return;
    try { acceptDevice(event.data.data); } catch {}
  });
  const deviceFile = document.getElementById('deviceFile');
  if (deviceFile) deviceFile.onchange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await importDeviceFile(file);
  };
  let lastCheck = Number(get('sirius-schedule-checked', '0')) || 0;
  let lastAttempt = 0;
  let currentRefresh = null;
  const incomingComplete = (data) => GROUPS.every((g) => Array.isArray(data?.groups?.[g]));
  const shouldFetchServer = (force) => {
    if (!navigator.onLine) return false;
    if (force) return true;
    if (!snapshot || !lastCheck) return true;
    const elapsed = Date.now() - lastCheck;
    if (elapsed >= 0 && elapsed < UPDATE_INTERVAL) return false;
    return true;
  };
  async function refreshNow({ force, background }) {
    if (!force && lastAttempt && Date.now() - lastAttempt < 60000) return;

    lastAttempt = Date.now();
    // On GitHub Pages the university's CORS policy always blocks this, and outside Russia
    // the request hangs until timeout, delaying the published snapshot. Only the local proxy works.
    if (navigator.onLine && localCollector()) {
      const got = await refreshDevice(force, { quiet: background || Boolean(snapshot) });
      if (got) {
        lastCheck = Date.now();
        put('sirius-schedule-checked', String(lastCheck));
        if (active()) render();
        tick();
        return;
      }
    }

    if (!shouldFetchServer(force)) {
      if (active()) render();
      tick();
      return;
    }

    const quiet = background && snapshot;
    if (!quiet) {
      loading = true;
      if (active()) render();
    }
    try {
      const url = new URL('data/schedule.json', base);
      url.searchParams.set('t', String(Date.now()));
      const res = await fetch(url, {cache:'reload', signal:AbortSignal.timeout(20000)});
      if (!res.ok) throw new Error('Schedule unavailable');
      const data = await res.json();
      if (!valid(data)) throw new Error('Invalid schedule');
      failure = res.headers?.get('X-Sirius-Offline') === 'true';
      const complete = incomingComplete(data);
      const newer = !snapshot || Date.parse(data.updatedAt) >= Date.parse(snapshot.updatedAt);
      const keepCompleteLocal = completeSnapshot() && !complete;
      if (newer && !keepCompleteLocal) {
        snapshot = data;
        put('sirius-schedule', JSON.stringify(data));
        put('sirius-schedule-origin', 'server');
      }
      if (!failure) {
        lastCheck = Date.now();
        put('sirius-schedule-checked', String(lastCheck));
      }
    } catch { failure = true; }
    finally { loading = false; if (active()) render(); tick(); }
  }
  async function refresh({ force = true, background = false } = {}) {
    if (!force && (currentRefresh || loading || deviceLoading)) return;
    if (background && currentRefresh) return;
    if (force && !background && currentRefresh) await currentRefresh.catch(() => {});
    const run = refreshNow({ force, background });
    currentRefresh = run;
    try { await run; } finally { if (currentRefresh === run) currentRefresh = null; }
  }
  const shiftDate = (iso, days) => {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const weekDates = (iso) => {
    const d = new Date(`${iso}T12:00:00Z`);
    const offset = (d.getUTCDay() + 6) % 7;
    const monday = shiftDate(iso, -offset);
    return Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  };
  const dayLabel = (iso, opts) =>
    new Date(`${iso}T12:00:00+03:00`).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow', ...opts });
  const slotsFor = (rows) => {
    const map = new Map();
    for (const e of rows) {
      const key = `${e.start}|${e.end}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return [...map.values()];
  };
  const pairsOn = (iso) => slotsFor(lessons().filter((e) => e.date === iso)).length;
  function lessonCard(slot) {
    const e = slot[0];
    const titles = [...new Set(slot.map((x) => x.title))];
    const kind = [...new Set(slot.map((x) => x.kind))].join(' · ');
    const rooms = slot.map((x) => x.room || '—');
    const teachers = slot.map((x) => x.teachers || '—');
    const comments = slot.map((x) => x.comment).filter(Boolean);
    const uniqueRooms = [...new Set(rooms)];
    const uniqueTeachers = [...new Set(teachers)];
    const variants =
      slot.length > 1
        ? `<div class="lesson-variants">${slot
            .map(
              (x) =>
                `<div class="lesson-variant"><span>${escape(x.room || '—')}</span><span>${escape(x.teachers || '—')}</span></div>`,
            )
            .join('')}</div>`
        : '';
    const metaBits = [`<span>${escape(kind)}</span>`];
    if (slot.length === 1) {
      metaBits.push(`<span>${escape(uniqueRooms[0])}</span>`, `<span>${escape(uniqueTeachers[0])}</span>`);
    } else {
      metaBits.push(`<span>${slot.length} потока</span>`);
    }
    return `<article class="lesson${slot.length > 1 ? ' lesson-multi' : ''}" data-start="${instant(e)}" data-end="${instant(e, 'end')}">
      <div class="lesson-time"><time>${escape(e.start)}</time><span>${escape(e.end)}</span></div>
      <div class="lesson-body">
        <h3>${escape(titles.join(' / '))}</h3>
        <p class="lesson-meta-line">${metaBits.join('')}</p>
        ${variants}
        ${comments.map((c) => `<p class="lesson-comment">${escape(c)}</p>`).join('')}
      </div>
      <div class="lesson-room">${
        slot.length > 1
          ? uniqueRooms.map((r) => `<span>${escape(r)}</span>`).join('')
          : escape(uniqueRooms[0])
      }</div>
      <div class="lesson-teacher">${
        slot.length > 1
          ? uniqueTeachers.map((t) => `<span>${escape(t)}</span>`).join('')
          : escape(uniqueTeachers[0])
      }</div>
    </article>`;
  }

  function statusLine() {
    const bits = [];
    if (!navigator.onLine) bits.push('Без интернета');
    else if (failure) bits.push('Офлайн-копия');
    else if (snapshot && !completeSnapshot()) bits.push('Не все группы');
    else if (snapshot && !fresh()) bits.push('Данные старше суток');
    if (get('sirius-schedule-origin', '') === 'device') bits.push('С устройства');
    if (deviceLoading) bits.push(deviceMessage || 'Загрузка с устройства…');
    if (snapshot) bits.push(`Обновлено ${new Date(snapshot.updatedAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`);
    return bits.join(' · ');
  }

  function weekNav() {
    const todayIso = today();
    return `<nav class="schedule-week" aria-label="Дни недели">${weekDates(date)
      .map((iso) => {
        const count = pairsOn(iso);
        const classes = [
          'schedule-week-day',
          iso === date ? 'active' : '',
          iso === todayIso ? 'is-today' : '',
          count ? 'has-lessons' : 'is-empty',
        ]
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${classes}" data-date="${escape(iso)}" aria-pressed="${iso === date}">
          <span class="weekday">${escape(dayLabel(iso, { weekday: 'short' }))}</span>
          <span class="daynum">${escape(dayLabel(iso, { day: 'numeric' }))}</span>
          <span class="daycount">${count ? count : '—'}</span>
        </button>`;
      })
      .join('')}</nav>`;
  }

  function deviceBanner() {
    if (deviceLoading) {
      return `<p class="schedule-device-banner" data-device-status role="status">${escape(deviceMessage || 'Загружаем расписание…')}</p>`;
    }
    if (deviceFailed) {
      return `<p class="schedule-device-banner" role="status"><span data-device-status>${escape(deviceMessage)}</span><button type="button" id="devicePickFile">Выбрать файл</button></p>`;
    }
    if (navigator.onLine && !completeSnapshot()) {
      return `<p class="schedule-device-banner" role="status">${localCollector() ? 'Общая копия неполная. Нажмите «С устройства», чтобы догрузить.' : 'Опубликованная копия неполная. Нажмите «Обновить» — берётся снимок с GitHub Pages.'}</p>`;
    }
    return '';
  }

  function render() {
    const rows = lessons().filter((e) => e.date === date);
    const slots = slotsFor(rows);
    const covered = Array.isArray(snapshot?.groups[group]) && date >= snapshot.fromDate && date <= snapshot.toDate;
    const [headline, detail] = nextText();
    const dayTitle = dayLabel(date, { weekday: 'long', day: 'numeric', month: 'long' });
    const empty = `<div class="empty-state">${covered ? 'В этот день занятий нет.' : 'На этот день нет сохранённых данных.' + (snapshot ? ` Период: ${snapshot.fromDate} — ${snapshot.toDate}.` : '')}</div>`;
    const note = notificationError || (enabled ? 'Уведомления включены' : '');
    document.getElementById('app').innerHTML = `<section class="schedule-page">
      <header class="schedule-head">
        <h1>Расписание</h1>
        <div class="schedule-toolbar">
          <select id="scheduleGroup" aria-label="Группа">${GROUPS.map((g) => `<option ${g === group ? 'selected' : ''}>${g}</option>`).join('')}</select>
          <div class="schedule-date">
            <button id="previousDay" aria-label="Предыдущий день">←</button>
            <input id="scheduleDate" type="date" value="${escape(date)}" aria-label="Дата">
            <button id="nextDay" aria-label="Следующий день">→</button>
          </div>
          <div class="schedule-date-actions">
            <button id="todayButton">Сегодня</button>
          </div>
        </div>
      </header>
      ${deviceBanner()}
      <div class="schedule-shell">
        <aside class="schedule-rail">
          <div class="schedule-next">
            <strong id="nextHeadline">${escape(headline)}</strong>
            <span id="nextDetail">${escape(detail)}</span>
          </div>
          ${weekNav()}
          <p class="schedule-meta schedule-meta-rail" role="status">${escape(statusLine())} · <a href="https://schedule.siriusuniversity.ru" target="_blank" rel="noopener">Источник</a></p>
        </aside>
        <div class="schedule-main">
          <div class="schedule-day-bar">
            <h2>${escape(dayTitle)}</h2>
            <span class="schedule-count">${slots.length || '0'}</span>
          </div>
          <div class="lesson-list">
            <div class="lesson-list-head" aria-hidden="true"><span>Время</span><span>Пара</span><span>Аудитория</span><span>Преподаватель</span></div>
            ${slots.map(lessonCard).join('') || empty}
          </div>
        </div>
      </div>
      <footer class="schedule-foot">
        <div class="schedule-reminders">
          <select id="reminderLead" aria-label="Напомнить за">${[5, 10, 15, 30].map((v) => `<option value="${v}" ${v === lead ? 'selected' : ''}>за ${v} мин</option>`).join('')}</select>
          <button id="enableReminders">${enabled ? 'Уведомления вкл.' : 'Уведомления'}</button>
          ${localCollector() ? `<button id="deviceSchedule" ${deviceLoading ? 'disabled' : ''} aria-busy="${deviceLoading}">${deviceLoading ? 'Загрузка…' : 'С устройства'}</button>` : ''}
          <button id="googleCalendar" ${lessons().length ? '' : 'disabled'} aria-label="Добавить в Google Календарь">Google</button>
          <button id="appleCalendar" ${lessons().length ? '' : 'disabled'} aria-label="Подписаться в Календаре Apple">Apple</button>
          <button id="notionCalendar" ${lessons().length ? '' : 'disabled'} aria-label="Добавить в Notion через Google Календарь">Notion</button>
          <button id="copyCalendar" ${lessons().length ? '' : 'disabled'} aria-label="Скопировать ссылку на календарь">Ссылка</button>
          <button id="exportCalendar" ${lessons().length ? '' : 'disabled'}>ICS</button>
          <span id="notificationStatus" role="status">${escape(note)}</span>
          <span id="calendarStatus" role="status">${escape(calendarMessage)}</span>
        </div>
        <p class="schedule-meta schedule-meta-foot" role="status">${escape(statusLine())} · <a href="https://schedule.siriusuniversity.ru" target="_blank" rel="noopener">Источник</a></p>
      </footer>
    </section>`;
    document.getElementById('scheduleGroup').onchange = (e) => {
      group = e.target.value;
      put('sirius-group', group);
      render();
      tick();
      if (!snapshot?.groups[group]) refresh();
    };
    document.getElementById('scheduleDate').onchange = (e) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {
        date = e.target.value;
        render();
      }
    };
    for (const [id, step] of [
      ['previousDay', -1],
      ['nextDay', 1],
    ])
      document.getElementById(id).onclick = () => {
        date = shiftDate(date, step);
        render();
      };
    document.getElementById('todayButton').onclick = () => {
      date = today();
      render();
    };
    document.getElementById('reminderLead').onchange = (e) => {
      lead = Number(e.target.value);
      put('sirius-lead', String(lead));
      render();
    };
    document.getElementById('enableReminders').onclick = toggleReminders;
    document.getElementById('exportCalendar').onclick = exportCalendar;
    document.getElementById('googleCalendar').onclick = addToGoogle;
    document.getElementById('notionCalendar').onclick = addToNotion;
    document.getElementById('appleCalendar').onclick = addToApple;
    document.getElementById('copyCalendar').onclick = copyCalendarLink;
    const deviceButton = document.getElementById('deviceSchedule');
    if (deviceButton) deviceButton.onclick = () => refreshDevice(true);
    const pickFile = document.getElementById('devicePickFile');
    if (pickFile) pickFile.onclick = pickDeviceFile;
    document.querySelectorAll('.schedule-week-day').forEach((btn) => {
      btn.onclick = () => {
        date = btn.dataset.date;
        render();
      };
    });
    paintTime();
  }
  // The worker can still be installing on the first launch; never wait forever (e.g. local preview has none).
  async function worker() {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.getRegistration(base.href);
    if (reg?.active) return reg;
    if (!navigator.serviceWorker.ready) return null;
    return Promise.race([navigator.serviceWorker.ready, new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
  }
  function notificationsUnavailable() {
    if (isIOS && !standalone()) return 'На iPhone уведомления работают только в приложении: «Поделиться» → «На экран Домой», затем откройте его с иконки.';
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return 'Этот браузер не поддерживает уведомления — используйте подписку на календарь.';
    return '';
  }
  async function toggleReminders() {
    notificationError = '';
    if (enabled) enabled = false;
    else if ((notificationError = notificationsUnavailable())) enabled = false;
    else {
      try {
        const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
        enabled = permission === 'granted';
        if (!enabled) notificationError = permission === 'denied'
          ? 'Уведомления запрещены. Разрешите их для этого сайта в настройках браузера или телефона.'
          : 'Нет разрешения на уведомления.';
      } catch { notificationError = 'Не удалось включить уведомления.'; }
      if (enabled) {
        try {
          const reg = await worker();
          if (!reg) throw new Error('no worker');
          await reg.showNotification('Уведомления включены', {body: `Напомним за ${lead} мин до пары, пока приложение открыто или свёрнуто. Для напоминаний при закрытом приложении подпишитесь на календарь.`, tag: 'sirius-test', icon: new URL('assets/icon-192.png', base).href});
        } catch { notificationError = 'Браузер не смог показать уведомление. Обновите страницу и попробуйте ещё раз.'; }
      }
    }
    put('sirius-reminders', String(enabled)); render(); tick();
  }
  function paintTime() {
    if(!active()) return;
    const [a,b]=nextText();
    const title=document.getElementById('nextHeadline'); if(title) title.textContent=a;
    const detail=document.getElementById('nextDetail'); if(detail) detail.textContent=b;
    document.querySelectorAll('.lesson').forEach(el=>el.classList.toggle('current',Number(el.dataset.start)<=Date.now()&&Number(el.dataset.end)>Date.now()));
  }
  let notifying=false;
  async function tick() {
    paintTime();
    if(notifying || !enabled || !fresh() || !('Notification' in window) || Notification.permission !== 'granted') return;
    notifying=true;
    try {
      const reg=await worker(); if(!reg) return;
      const due=lessons().filter(e=>instant(e)>Date.now() && instant(e)-Date.now()<=lead*60000);
      // Same-time subgroups are combined into one reminder.
      for(const start of new Set(due.map(e=>instant(e)))) {
        const key=`sirius-notified:${group}:${start}`;
        if(get(key,'')) continue;
        const batch=due.filter(e=>instant(e)===start);
        await reg.showNotification(`До пары ${Math.ceil((start-Date.now())/60000)} мин`, {body:[...new Set(batch.map(e=>`${e.title} · ${e.room || 'аудитория не указана'}`))].join('\n'),tag:key,icon:new URL('assets/icon-192.png',base).href,data:{url:new URL('#/schedule',base).href}});
        put(key,'1');
      }
    } catch { notificationError='Браузер не смог показать уведомление. Проверьте разрешения или используйте календарь.'; if(active()) document.getElementById('notificationStatus').textContent=notificationError; }
    finally {notifying=false;}
  }
  function calendarSlug(name) {
    return String(name).replace('ИОП-ИТ-', 'iop-it-').replace('/', '-');
  }
  const PUBLISHED_SITE = 'https://arduradiokot.github.io/sirius-it-wiki/';
  function canSubscribeCalendar() {
    return location.protocol === 'https:' && !isLocalHost(location.hostname);
  }
  function subscribeFeedHref() {
    const file = `data/calendars/${calendarSlug(group)}.ics`;
    return canSubscribeCalendar() ? new URL(file, base).href : new URL(file, PUBLISHED_SITE).href;
  }
  function googleSubscribeHref() {
    const webcal = subscribeFeedHref().replace(/^https:/i, 'webcal:').replace(/^http:/i, 'webcal:');
    // cid=https://… is rejected; Google accepts an unencoded webcal:// feed as a one-click subscribe.
    return 'https://calendar.google.com/calendar/render?cid=' + webcal;
  }
  function openGoogleSubscribe() {
    window.open(googleSubscribeHref(), '_blank', 'noopener,noreferrer');
  }
  function showCalendarMessage(text) {
    calendarMessage = text;
    const el = document.getElementById('calendarStatus');
    if (el) el.textContent = text;
  }
  function icsEscape(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  }
  function icsStamp(ms) {
    return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
  }
  function foldIcs(line) {
    let out = '', length = 0;
    for (const c of line) {
      const bytes = new TextEncoder().encode(c).length;
      if (length + bytes > 74) {
        out += '\r\n ';
        length = 1;
      }
      out += c;
      length += bytes;
    }
    return out;
  }
  function buildCalendar() {
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Sirius Wiki//Schedule//RU',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:Сириус ${group}`,
      'X-WR-TIMEZONE:Europe/Moscow',
      'REFRESH-INTERVAL;VALUE=DURATION:PT4H',
      'X-PUBLISHED-TTL:PT4H',
    ];
    for (const e of lessons()) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${e.id}@sirius-wiki`,
        `DTSTAMP:${icsStamp(Date.now())}`,
        `DTSTART:${icsStamp(instant(e))}`,
        `DTEND:${icsStamp(instant(e, 'end'))}`,
        `SUMMARY:${icsEscape(e.title)}`,
        `LOCATION:${icsEscape(e.room)}`,
        `DESCRIPTION:${icsEscape(group + ' · ' + e.teachers + '\n' + e.kind + '\n' + e.comment)}`,
        'BEGIN:VALARM',
        `TRIGGER:-PT${lead}M`,
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape(e.title)}`,
        'END:VALARM',
        'END:VEVENT',
      );
    }
    lines.push('END:VCALENDAR');
    return lines.map(foldIcs).join('\r\n') + '\r\n';
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }
  const GOOGLE_BY_URL = 'откройте calendar.google.com на компьютере → «Другие календари» → «+» → «Добавить по URL» и вставьте её. После этого пары появятся и в приложении Google Календарь на телефоне.';
  async function googleOnPhone(extra = '') {
    // Google Calendar apps cannot subscribe by link; only the desktop site can.
    const link = subscribeFeedHref();
    const copied = await copyText(link);
    showCalendarMessage((copied ? 'Ссылка скопирована. ' : `Ссылка: ${link}. `) + 'На телефоне Google Календарь не добавляет календари по ссылке: ' + GOOGLE_BY_URL + extra);
  }
  function addToGoogle() {
    if (!lessons().length) return;
    if (isMobile) return googleOnPhone();
    openGoogleSubscribe();
    showCalendarMessage('Подтвердите добавление календаря в Google.');
  }
  function addToNotion() {
    if (!lessons().length) return;
    if (isMobile) return googleOnPhone(' В Notion Calendar пары появятся сами, если подключён тот же Google-аккаунт.');
    openGoogleSubscribe();
    showCalendarMessage('Подтвердите добавление в Google. В Notion Calendar пары появятся сами, если подключён тот же Google-аккаунт.');
  }
  function addToApple() {
    if (!lessons().length) return;
    // webcal:// opens the native "Subscribe" dialog on iPhone, iPad and Mac; the feed then updates itself.
    location.href = subscribeFeedHref().replace(/^https?:/i, 'webcal:');
    showCalendarMessage('Подтвердите подписку в Календаре. Если ничего не открылось, нажмите «Ссылка» и добавьте календарь по URL.');
  }
  async function copyCalendarLink() {
    if (!lessons().length) return;
    const link = subscribeFeedHref();
    showCalendarMessage(await copyText(link)
      ? 'Ссылка на календарь скопирована. Вставьте её в календаре как подписку по URL — пары будут обновляться сами.'
      : `Ссылка на календарь: ${link}`);
  }
  function exportCalendar() {
    if (isIOS) {
      // Blob downloads do nothing in an iOS home-screen app; Safari can open the published file instead.
      window.open(subscribeFeedHref(), '_blank', 'noopener');
      showCalendarMessage('Нажмите «Добавить все» в открывшемся окне. Чтобы пары обновлялись сами, лучше используйте «Apple».');
      return;
    }
    const url = URL.createObjectURL(new Blob([buildCalendar()], { type: 'text/calendar;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `sirius-${group.replace('ИОП-ИТ-', '').replace('/', '-')}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    showCalendarMessage('Файл скачан. Это разовый снимок — для автообновления используйте подписку.');
  }
  window.SiriusSchedule={render,refresh};
  let lastEnter = 0;
  const refreshOnEnter = () => {
    const now = Date.now();
    if (lastEnter && now - lastEnter < 2000) return;
    lastEnter = now;
    return refresh({force:true, background:true});
  };
  const autoRefresh = () => refresh({force:false, background:true});
  window.addEventListener('online', refreshOnEnter);
  window.addEventListener('focus', refreshOnEnter);
  window.addEventListener('pageshow', refreshOnEnter);
  document.addEventListener('visibilitychange',()=>{if(document.hidden) return; const pending=refreshOnEnter(); tick(); return pending;});
  setInterval(autoRefresh, 60000);setInterval(tick,15000);refreshOnEnter();
})();
