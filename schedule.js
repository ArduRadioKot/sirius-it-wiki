(() => {
  const GROUPS = ['ИОП-ИТ-26/1', 'ИОП-ИТ-26/2'];
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
  const valid = d => d?.version === 1 && Number.isFinite(Date.parse(d.updatedAt)) && /^\d{4}-\d{2}-\d{2}$/.test(d.fromDate) && /^\d{4}-\d{2}-\d{2}$/.test(d.toDate) && GROUPS.every(g => Array.isArray(d.groups?.[g]) && d.groups[g].every(e => typeof e.id === 'string' && typeof e.title === 'string' && Number.isFinite(instant(e)) && instant(e, 'end') > instant(e)));
  try { const saved = JSON.parse(get('sirius-schedule', 'null')); if (valid(saved)) snapshot = saved; } catch {}
  const lessons = () => snapshot?.groups[group] || [];
  const active = () => location.hash.startsWith('#/schedule');
  const fresh = () => snapshot && Date.now() - Date.parse(snapshot.updatedAt) < 24 * 3600000;
  const nextText = () => {
    if (!snapshot) return ['Расписание загружается', 'Нужен интернет для первой загрузки'];
    if (today() < snapshot.fromDate || today() > snapshot.toDate) return ['Нужно обновить расписание', 'Сохранённый период не включает сегодня'];
    const now = Date.now(), ongoing = lessons().filter(e => instant(e) <= now && instant(e, 'end') > now);
    if (ongoing.length) return [`До конца пары ${Math.ceil((instant(ongoing[0], 'end') - now)/60000)} мин`, [...new Set(ongoing.map(e => e.title))].join(' / ')];
    const next = lessons().find(e => instant(e) > now);
    if (!next) return ['Пар больше нет', 'В сохранённом периоде'];
    const minutes = Math.ceil((instant(next) - now)/60000), days = Math.floor(minutes/1440), hours = Math.floor(minutes%1440/60);
    return [`До пары ${days ? days + ' д ' : ''}${hours ? hours + ' ч ' : ''}${minutes%60} мин`, `${next.title} · ${next.date === today() ? 'сегодня' : next.date} в ${next.start}`];
  };
  async function refresh() {
    if (loading) return;
    loading = true; if (active()) render();
    try {
      const res = await fetch(new URL('data/schedule.json', base), {cache:'no-store', signal:AbortSignal.timeout(15000)});
      if (!res.ok) throw new Error('Schedule unavailable');
      const data = await res.json();
      if (!valid(data)) throw new Error('Invalid schedule');
      snapshot = data; put('sirius-schedule', JSON.stringify(data)); failure = res.headers?.get('X-Sirius-Offline') === 'true';
    } catch { failure = true; }
    finally { loading = false; if (active()) render(); tick(); }
  }
  function lessonCard(e) {
    const room = e.room || '—';
    const teacher = e.teachers || '—';
    return `<article class="lesson" data-start="${instant(e)}" data-end="${instant(e,'end')}">
      <div class="lesson-time"><time>${escape(e.start)}</time><span>${escape(e.end)}</span></div>
      <div class="lesson-body">
        <h3>${escape(e.title)}</h3>
        <p class="lesson-meta-line"><span>${escape(e.kind)}</span><span>${escape(room)}</span><span>${escape(teacher)}</span></p>
        ${e.comment ? `<p class="lesson-comment">${escape(e.comment)}</p>` : ''}
      </div>
      <div class="lesson-room">${escape(room)}</div>
      <div class="lesson-teacher">${escape(teacher)}</div>
    </article>`;
  }

  function statusLine() {
    const bits = [];
    if (!navigator.onLine) bits.push('Без интернета');
    else if (failure) bits.push('Офлайн-копия');
    else if (snapshot && !fresh()) bits.push('Данные старше суток');
    if (snapshot) bits.push(`Обновлено ${new Date(snapshot.updatedAt).toLocaleString('ru-RU', {timeZone:'Europe/Moscow'})}`);
    return bits.join(' · ');
  }

  function render() {
    const rows = lessons().filter(e => e.date === date);
    const covered = snapshot && date >= snapshot.fromDate && date <= snapshot.toDate;
    const [headline, detail] = nextText();
    const dayTitle = new Date(date+'T12:00:00+03:00').toLocaleDateString('ru-RU', {weekday:'long', day:'numeric', month:'long', timeZone:'Europe/Moscow'});
    const empty = `<div class="empty-state">${covered ? 'В этот день занятий нет.' : 'На этот день нет сохранённых данных.' + (snapshot ? ` Период: ${snapshot.fromDate} — ${snapshot.toDate}.` : '')}</div>`;
    const note = notificationError || (enabled ? 'Уведомления включены' : '');
    document.getElementById('app').innerHTML = `<section class="schedule-page">
      <header class="schedule-head">
        <h1>Расписание</h1>
        <div class="schedule-toolbar">
          <select id="scheduleGroup" aria-label="Группа">${GROUPS.map(g => `<option ${g === group ? 'selected' : ''}>${g}</option>`).join('')}</select>
          <div class="schedule-date">
            <button id="previousDay" aria-label="Предыдущий день">←</button>
            <input id="scheduleDate" type="date" value="${escape(date)}" aria-label="Дата">
            <button id="nextDay" aria-label="Следующий день">→</button>
            <button id="todayButton">Сегодня</button>
          </div>
          <button id="refreshSchedule" ${loading ? 'disabled' : ''}>${loading ? '…' : '↻'}</button>
        </div>
      </header>
      <div class="schedule-next">
        <strong id="nextHeadline">${escape(headline)}</strong>
        <span id="nextDetail">${escape(detail)}</span>
      </div>
      <div class="schedule-day-bar">
        <h2>${escape(dayTitle)}</h2>
        <span class="schedule-count">${rows.length || '0'}</span>
      </div>
      <div class="lesson-list">
        <div class="lesson-list-head" aria-hidden="true"><span>Время</span><span>Пара</span><span>Аудитория</span><span>Преподаватель</span></div>
        ${rows.map(lessonCard).join('') || empty}
      </div>
      <footer class="schedule-foot">
        <div class="schedule-reminders">
          <select id="reminderLead" aria-label="Напомнить за">${[5,10,15,30].map(v => `<option value="${v}" ${v === lead ? 'selected' : ''}>за ${v} мин</option>`).join('')}</select>
          <button id="enableReminders">${enabled ? 'Уведомления вкл.' : 'Уведомления'}</button>
          <button id="exportCalendar" ${lessons().length ? '' : 'disabled'}>В календарь</button>
          <span id="notificationStatus" role="status">${escape(note)}</span>
        </div>
        <p class="schedule-meta" role="status">${escape(statusLine())} · <a href="https://schedule.siriusuniversity.ru" target="_blank" rel="noopener">Источник</a></p>
      </footer>
    </section>`;
    document.getElementById('scheduleGroup').onchange = e => { group=e.target.value; put('sirius-group',group); render(); tick(); };
    document.getElementById('scheduleDate').onchange = e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) {date=e.target.value;render();} };
    for (const [id, step] of [['previousDay',-1],['nextDay',1]]) document.getElementById(id).onclick = () => { const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+step);date=d.toISOString().slice(0,10);render(); };
    document.getElementById('todayButton').onclick=()=>{date=today();render();};
    document.getElementById('refreshSchedule').onclick=refresh;
    document.getElementById('reminderLead').onchange=e=>{lead=Number(e.target.value);put('sirius-lead',String(lead));render();};
    document.getElementById('enableReminders').onclick=toggleReminders;
    document.getElementById('exportCalendar').onclick=exportCalendar;
    paintTime();
  }
  async function toggleReminders() {
    notificationError='';
    if(enabled) enabled=false;
    else if(!('Notification' in window) || !('serviceWorker' in navigator)) notificationError='Уведомления недоступны — используйте календарь';
    else {
      try { enabled = (await Notification.requestPermission()) === 'granted'; if (!enabled) notificationError='Нет разрешения на уведомления'; }
      catch { notificationError='Не удалось включить уведомления'; }
    }
    put('sirius-reminders',String(enabled));render();tick();
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
      const reg=await navigator.serviceWorker.getRegistration(base.href); if(!reg?.active) return;
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
  function exportCalendar() {
    const esc=s=>String(s||'').replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
    const stamp=ms=>new Date(ms).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z/,'Z');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Sirius Wiki//Schedule//RU','CALSCALE:GREGORIAN'];
    for(const e of lessons()) lines.push('BEGIN:VEVENT',`UID:${e.id}@sirius-wiki`,`DTSTAMP:${stamp(Date.now())}`,`DTSTART:${stamp(instant(e))}`,`DTEND:${stamp(instant(e,'end'))}`,`SUMMARY:${esc(e.title)}`,`LOCATION:${esc(e.room)}`,`DESCRIPTION:${esc(group+' · '+e.teachers+'\n'+e.kind+'\n'+e.comment)}`,'BEGIN:VALARM',`TRIGGER:-PT${lead}M`,'ACTION:DISPLAY',`DESCRIPTION:${esc(e.title)}`,'END:VALARM','END:VEVENT');
    lines.push('END:VCALENDAR');
    // RFC 5545 folding is based on UTF-8 bytes, not character count.
    const fold=line=>{let out='',length=0;for(const c of line){const bytes=new TextEncoder().encode(c).length;if(length+bytes>74){out+='\r\n ';length=1;}out+=c;length+=bytes;}return out;};
    const url=URL.createObjectURL(new Blob([lines.map(fold).join('\r\n')+'\r\n'],{type:'text/calendar;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`sirius-${group.endsWith('/1')?'1':'2'}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
  window.SiriusSchedule={render,refresh};
  window.addEventListener('online',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();tick();}});
  setInterval(refresh,15*60000);setInterval(tick,15000);refresh();
})();
