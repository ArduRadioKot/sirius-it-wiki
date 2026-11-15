// Live "now" panel: countdown to the end of the current pair, to the next pair
// and to the end of the study day, plus a ribbon of today's pairs.
(() => {
  const ZONE = 'Europe/Moscow';
  const escape = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = (ms = Date.now()) => new Intl.DateTimeFormat('sv-SE', { timeZone: ZONE }).format(new Date(ms));
  const at = (date, time) => new Date(`${date}T${time}:00+03:00`).getTime();
  const dayLabel = (iso, opts) => new Date(`${iso}T12:00:00+03:00`).toLocaleDateString('ru-RU', { timeZone: ZONE, ...opts });
  const RING = 2 * Math.PI * 54;

  function slots(rows) {
    const map = new Map();
    for (const e of rows) {
      const key = `${e.date}|${e.start}|${e.end}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return [...map.values()]
      .map(list => ({ list, date: list[0].date, start: list[0].start, end: list[0].end, from: at(list[0].date, list[0].start), to: at(list[0].date, list[0].end) }))
      .sort((a, b) => a.from - b.from || a.to - b.to);
  }

  // Pure state for a moment in time, so the panel and tests read the same thing.
  function state(rows, now = Date.now()) {
    const all = slots(rows || []);
    const day = today(now);
    const todays = all.filter(s => s.date === day);
    const current = todays.find(s => s.from <= now && s.to > now) || null;
    const upcoming = all.find(s => s.from > now) || null;
    const nextToday = todays.find(s => s.from > now) || null;
    const dayEnd = todays.length ? Math.max(...todays.map(s => s.to)) : null;
    const left = todays.filter(s => s.to > now).length;
    let phase = 'none';
    if (todays.length) {
      if (current) phase = 'lesson';
      else if (now < todays[0].from) phase = 'before';
      else if (now >= dayEnd) phase = 'after';
      else phase = 'break';
    }
    return { now, day, todays, current, upcoming, nextToday, dayEnd, left, phase };
  }

  function clock(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }
  function span(ms) {
    const minutes = Math.max(0, Math.ceil(ms / 60000));
    const d = Math.floor(minutes / 1440), h = Math.floor(minutes % 1440 / 60), m = minutes % 60;
    if (d) return `${d} д ${h} ч`;
    if (h) return m ? `${h} ч ${m} мин` : `${h} ч`;
    return `${m} мин`;
  }
  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
  };
  const titleOf = slot => [...new Set(slot.list.map(e => e.title))].join(' / ');
  const roomOf = slot => [...new Set(slot.list.map(e => e.room).filter(Boolean))].join(', ');

  function view(s) {
    const { phase, current, nextToday, upcoming, dayEnd, now } = s;
    let label, target, total, focus, sub;
    if (phase === 'lesson') {
      label = 'до конца пары'; target = current.to; total = current.to - current.from; focus = current;
      sub = nextToday ? `Дальше в ${nextToday.start}: ${titleOf(nextToday)}` : 'Это последняя пара сегодня';
    } else if (phase === 'break' || phase === 'before') {
      const previousEnd = phase === 'break' ? Math.max(...s.todays.filter(x => x.to <= now).map(x => x.to)) : null;
      label = phase === 'break' ? 'до конца перемены' : 'до первой пары';
      target = nextToday.from; total = previousEnd ? nextToday.from - previousEnd : 3 * 3600000;
      focus = nextToday; sub = roomOf(nextToday) || 'Аудитория не указана';
    } else {
      focus = upcoming;
      label = 'до следующей пары';
      target = upcoming?.from ?? null; total = null;
      sub = upcoming ? `${dayLabel(upcoming.date, { weekday: 'long', day: 'numeric', month: 'long' })}, ${upcoming.start}` : '';
    }
    return { label, target, total, focus, sub, dayEnd };
  }

  function headline(s) {
    if (s.phase === 'lesson') return 'Идёт пара';
    if (s.phase === 'break') return 'Перемена';
    if (s.phase === 'before') return 'Скоро пары';
    if (s.phase === 'after') return 'Пары закончились';
    return 'Сегодня пар нет';
  }

  function ribbon(s) {
    if (!s.todays.length) return '';
    const first = s.todays[0].from, last = s.dayEnd, length = last - first || 1;
    const needle = s.now >= first && s.now <= last ? `<span class="now-needle" style="left:${((s.now - first) / length * 100).toFixed(2)}%"></span>` : '';
    return `<div class="now-ribbon" role="img" aria-label="Пары сегодня: ${s.todays.map(x => `${x.start}–${x.end}`).join(', ')}">
      <div class="now-ribbon-track">${s.todays.map(x => {
        const state = x.to <= s.now ? 'done' : x.from <= s.now ? 'live' : 'later';
        const fill = state === 'live' ? ((s.now - x.from) / (x.to - x.from) * 100).toFixed(1) : state === 'done' ? 100 : 0;
        return `<span class="now-seg is-${state}" style="left:${((x.from - first) / length * 100).toFixed(2)}%;width:${((x.to - x.from) / length * 100).toFixed(2)}%;--fill:${fill}%" title="${escape(x.start + '–' + x.end + ' ' + titleOf(x))}"></span>`;
      }).join('')}${needle}</div>
      <div class="now-ribbon-scale"><span>${escape(s.todays[0].start)}</span><span>${escape(s.todays[s.todays.length - 1].end)}</span></div>
    </div>`;
  }

  function relativeDay(iso, now) {
    const t = today(now);
    const next = new Date(`${t}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    if (iso === t) return 'сегодня';
    if (iso === next.toISOString().slice(0, 10)) return 'завтра';
    return dayLabel(iso, { weekday: 'long' }).replace(/^./, c => c.toLocaleLowerCase('ru'));
  }
  function agenda(s, group) {
    const first = s.upcoming;
    const head = `<p class="now-context"><span class="now-dot" data-phase="${s.phase}"></span>${escape(headline(s))}<span class="now-group">${escape(group)}</span></p>`;
    if (!first) return `<div class="now-body">${head}<h2 class="now-title">Впереди пар нет</h2><p class="now-sub">Расписание на следующие дни ещё не опубликовано.</p></div>`;
    const day = slots((window.SiriusSchedule?.rows?.() || []).filter(e => e.date === first.date));
    const when = relativeDay(first.date, s.now);
    return `<div class="now-body">${head}
        <h2 class="now-title">Первая пара ${escape(when)} в ${escape(first.start)}</h2>
        <p class="now-sub">Через <span data-now-clock>${escape(span(first.from - s.now))}</span> · ${escape(dayLabel(first.date, { day: 'numeric', month: 'long' }))}</p>
      </div>
      <ol class="now-agenda" aria-label="Пары ${escape(when)}">${day.map(x => `<li><time>${escape(x.start)}<span>${escape(x.end)}</span></time><div><strong>${escape(titleOf(x))}</strong><span>${escape([...new Set(x.list.map(e => e.kind).filter(Boolean))].join(', ') + (roomOf(x) ? ' · ' + roomOf(x) : ''))}</span></div></li>`).join('')}</ol>`;
  }

  function markup(s, group) {
    if (s.phase === 'none' || s.phase === 'after') return agenda(s, group);
    const v = view(s);
    const progress = v.total ? Math.min(1, Math.max(0, 1 - (v.target - s.now) / v.total)) : 0;
    const count = s.todays.length;
    const stats = count ? `<dl class="now-stats">
        <div><dt>До конца пар</dt><dd data-now-dayleft>${s.phase === 'after' ? 'свободен' : span(s.dayEnd - s.now)}</dd></div>
        <div><dt>Осталось</dt><dd>${s.left} ${plural(s.left, 'пара', 'пары', 'пар')} из ${count}</dd></div>
        <div><dt>Свободен с</dt><dd>${escape(s.todays[count - 1].end)}</dd></div>
      </dl>` : '';
    const focus = v.focus ? `<h2 class="now-title">${escape(titleOf(v.focus))}</h2>` : '<h2 class="now-title">Расписание пока пустое</h2>';
    const clockText = v.target ? (v.target - s.now > 86400000 ? span(v.target - s.now) : clock(v.target - s.now)) : '—';
    return `<div class="now-dial" aria-hidden="true">
        <svg viewBox="0 0 120 120"><circle class="now-dial-track" cx="60" cy="60" r="54"/><circle class="now-dial-fill" cx="60" cy="60" r="54" stroke-dasharray="${RING.toFixed(2)}" stroke-dashoffset="${(RING * (1 - progress)).toFixed(2)}"/></svg>
        <div class="now-dial-face"><strong data-now-clock>${escape(clockText)}</strong><span>${escape(v.label || '')}</span></div>
      </div>
      <div class="now-body">
        <p class="now-context"><span class="now-dot" data-phase="${s.phase}"></span>${escape(headline(s))}<span class="now-group">${escape(group)}</span></p>
        ${focus}
        <p class="now-sub">${escape(v.sub || '')}</p>
      </div>
      ${stats}
      ${ribbon(s)}`;
  }

  const mounts = new Set();
  let timer = 0;
  function paint(entry) {
    const api = window.SiriusSchedule;
    const rows = api?.rows?.() || [];
    const s = state(rows, Date.now());
    const key = [s.phase, s.current?.from, s.nextToday?.from, s.upcoming?.from, s.todays.length, api?.group?.()].join('|');
    if (!rows.length && api?.ready && !api.ready()) {
      entry.el.dataset.phase = 'loading';
      entry.el.innerHTML = '<div class="now-body"><p class="now-context">Загружаем расписание…</p></div>';
      entry.key = '';
      return s;
    }
    if (entry.key !== key || Math.floor(Date.now() / 1000) % 20 === 0) {
      entry.key = key;
      entry.el.dataset.phase = s.phase;
      entry.el.dataset.layout = s.phase === 'none' || s.phase === 'after' ? 'agenda' : 'live';
      entry.el.innerHTML = markup(s, api?.group?.() || '');
    } else {
      const v = view(s);
      const clockEl = entry.el.querySelector('[data-now-clock]');
      if (clockEl && v.target) clockEl.textContent = (s.phase === 'none' || s.phase === 'after') ? span(v.target - s.now) : v.target - s.now > 86400000 ? span(v.target - s.now) : clock(v.target - s.now);
      const fill = entry.el.querySelector('.now-dial-fill');
      if (fill && v.total) fill.style.strokeDashoffset = (RING * (1 - Math.min(1, Math.max(0, 1 - (v.target - s.now) / v.total)))).toFixed(2);
      const dayLeft = entry.el.querySelector('[data-now-dayleft]');
      if (dayLeft && s.dayEnd && s.phase !== 'after') dayLeft.textContent = span(s.dayEnd - s.now);
      const live = entry.el.querySelector('.now-seg.is-live');
      if (live && s.current) live.style.setProperty('--fill', ((s.now - s.current.from) / (s.current.to - s.current.from) * 100).toFixed(1) + '%');
    }
    return s;
  }
  function loop() {
    let last = null;
    for (const entry of [...mounts]) {
      if (!entry.el.isConnected) { mounts.delete(entry); continue; }
      last = paint(entry);
    }
    // Progress bar inside the current lesson card of the schedule page.
    document.querySelectorAll('.lesson.current').forEach(el => {
      const from = Number(el.dataset.start), to = Number(el.dataset.end);
      el.style.setProperty('--lesson-progress', `${Math.min(100, Math.max(0, (Date.now() - from) / (to - from) * 100)).toFixed(1)}%`);
    });
    const rows = window.SiriusSchedule?.rows?.();
    if (rows && 'setAppBadge' in navigator) {
      const s = last || state(rows);
      (s.left ? navigator.setAppBadge(s.left) : navigator.clearAppBadge()).catch(() => {});
    }
    if (!mounts.size) { clearInterval(timer); timer = 0; }
  }
  function mount(el, options = {}) {
    if (!el) return;
    el.classList.add('now-card');
    el.classList.toggle('now-compact', Boolean(options.compact));
    for (const entry of mounts) if (entry.el === el) mounts.delete(entry);
    const entry = { el, key: '' };
    mounts.add(entry);
    paint(entry);
    if (!timer) timer = setInterval(loop, 1000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loop(); });

  window.SiriusNow = { mount, state, clock, span };
})();
