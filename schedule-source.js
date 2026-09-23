/* Shared collector: runs in the PWA (subject to CORS), or on the official site
   through the user-installed export bookmark. Never disables browser protections. */
(function (root) {
  function createScheduleSource() {
    const SOURCE = 'https://schedule.siriusuniversity.ru';
    const PAGE_SCRIPT = typeof document !== 'undefined' ? document.currentScript : null;
    function isLocalHost(hostname) {
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0' ||
        hostname === '::1' || hostname === '[::1]' || (typeof hostname === 'string' && hostname.endsWith('.local')) ||
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
    }
    const sourceOrigin = () => {
      try {
        if (PAGE_SCRIPT) {
          const here = new URL('./', PAGE_SCRIPT.src);
          if (isLocalHost(here.hostname)) return new URL('__schedule', here).href.replace(/\/$/, '');
        }
      } catch {}
      return SOURCE;
    };
    const pageOrigin = () => {
      try { return location.origin; } catch { return ''; }
    };
    const GROUPS = ['ИОП-ИТ-26/1', 'ИОП-ИТ-26/2', 'ИОП-ИТ-25/1', 'ИОП-ИТ-25/2'];
    const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
    const shift = (date, days) => {
      const value = new Date(`${date}T12:00:00Z`);
      value.setUTCDate(value.getUTCDate() + days);
      return value.toISOString().slice(0, 10);
    };
    function validDay(date) {
      if (!dayPattern.test(date)) return false;
      const parsed = new Date(`${date}T12:00:00Z`);
      return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
    }
    function valid(data, complete = false, referenceNow = Date.now()) {
      if (!data || data.version !== 1 || data.source !== SOURCE || !Number.isFinite(Date.parse(data.updatedAt)) ||
          Date.parse(data.updatedAt) > referenceNow + 300000 || !validDay(data.fromDate) || !validDay(data.toDate) ||
          shift(data.fromDate, 20) !== data.toDate || !data.groups || typeof data.groups !== 'object') return false;
      const present = GROUPS.filter(g => Object.hasOwn(data.groups, g));
      if (!present.length || (complete && present.length !== GROUPS.length)) return false;
      return present.every(g => Array.isArray(data.groups[g]) && data.groups[g].length <= 1000 && data.groups[g].every(e =>
        e && typeof e.id === 'string' && e.id.length > 0 && e.id.length < 256 &&
        typeof e.title === 'string' && e.title.length > 0 && e.title.length <= 2000 &&
        validDay(e.date) && e.date >= data.fromDate && e.date <= data.toDate &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(e.start) && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.end) && e.start < e.end &&
        ['kind', 'room', 'address', 'teachers', 'comment'].every(k => e[k] == null || (typeof e[k] === 'string' && e[k].length <= 5000))));
    }
    function parseInitial(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const el = doc.querySelector('[wire\\:initial-data]');
      if (!el) throw new Error('Не удалось распознать страницу расписания.');
      const state = JSON.parse(el.getAttribute('wire:initial-data'));
      const token = html.match(/window\.livewire_token\s*=\s*['"]([^'"]+)['"]/)?.[1] || doc.querySelector('meta[name="csrf-token"]')?.content;
      if (!token || state.fingerprint?.name !== 'main-grid' || !state.serverMemo?.data) throw new Error('Формат сайта расписания изменился.');
      return {state, token};
    }
    function mergeMemo(state, response) {
      const memo = response?.serverMemo;
      if (!memo || !memo.checksum || (memo.errors && Object.keys(memo.errors).length)) throw new Error('Сайт не смог вернуть расписание.');
      const data = {...state.serverMemo.data, ...(memo.data || {})};
      state.serverMemo = {...state.serverMemo, ...memo, data};
      return data;
    }
    function teachers(value) {
      if (typeof value === 'string') return value;
      if (value?.fio) return value.fio;
      return Object.values(value || {}).map(t => typeof t === 'string' ? t : t?.fio || '').filter(Boolean).join(', ');
    }
    async function normalize(events, group, first, last) {
      if (!events || typeof events !== 'object') throw new Error('Неожиданный формат занятий.');
      const rows = [];
      for (const bucket of Object.values(events)) {
        if (!Array.isArray(bucket)) throw new Error('Неожиданный формат занятий.');
        for (const e of bucket) {
          const parts = String(e.date).split('.');
          const date = parts.reverse().join('-');
          if (e.group !== group || !validDay(date) || date < first || date > last || !e.discipline) throw new Error('Источник вернул другую группу или неделю.');
          let room = e.classroom || e.place || '';
          if (room && room.length % 2 === 0 && room.slice(0, room.length / 2) === room.slice(room.length / 2)) room = room.slice(0, room.length / 2);
          const row = {date, start:e.startTime, end:e.endTime, title:e.discipline, kind:e.groupType || '', room,
            address:e.address || '', teachers:teachers(e.teachers), comment:e.comment || ''};
          // Match Python's sorted JSON encoding so calendar event IDs stay stable
          // when switching between server and device updates.
          const canonical = '{' + Object.keys(row).sort().map(k => JSON.stringify(k) + ': ' + JSON.stringify(row[k])).join(', ') + '}';
          const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(group + canonical));
          row.id = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0,20);
          rows.push(row);
        }
      }
      return rows;
    }
    async function collect({request = fetch, progress = () => {}, now = new Date()} = {}) {
      const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Europe/Moscow'}).format(now);
      const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
      const monday = shift(today, -(weekday + 6) % 7);
      const groups = {};
      const origin = sourceOrigin();
      async function read(path, options = {}) {
        const response = await request(origin + path, {credentials: pageOrigin() === SOURCE ? 'include' : 'omit', cache:'no-store', ...options, signal:AbortSignal.timeout(45000)});
        if (!response.ok) throw new Error('Сайт расписания вернул ошибку.');
        return response;
      }
      for (const group of GROUPS) {
        progress(`Загрузка ${group}…`);
        const {state, token} = parseInitial(await (await read('/')).text());
        const call = async (method, params) => {
          const response = await read('/livewire/message/main-grid', {method:'POST', headers:{'Content-Type':'application/json', 'X-Livewire':'true'},
            body:JSON.stringify({fingerprint:state.fingerprint, serverMemo:state.serverMemo, _token:token,
              updates:[{type:'callMethod', payload:{id:state.fingerprint?.id || 'schedule', method, params}}]})});
          return mergeMemo(state, await response.json());
        };
        let data = await call('set', [group]);
        let rows = [];
        for (let week = 0; week < 3; week++) {
          if (week) data = await call('addWeek', []);
          if (data.group !== group) throw new Error('Группа не подтверждена источником.');
          const first = shift(monday, week * 7);
          rows.push(...await normalize(data.events, group, first, shift(first, 6)));
        }
        groups[group] = [...new Map(rows.map(e => [e.id,e])).values()].sort((a,b) => (a.date+a.start+a.title).localeCompare(b.date+b.start+b.title, 'ru'));
      }
      const result = {version:1, source:SOURCE, updatedAt:now.toISOString(), fromDate:monday, toDate:shift(monday,20), groups};
      if (!valid(result, true, now.getTime())) throw new Error('Получено некорректное расписание.');
      return result;
    }
    return {collect, valid, normalize, mergeMemo, GROUPS, SOURCE, isLocalHost};
  }
  async function exportOnOfficialSite(factory) {
    if (location.origin !== 'https://schedule.siriusuniversity.ru') {
      alert('Откройте schedule.siriusuniversity.ru и запустите эту закладку там.'); return;
    }
    if (document.getElementById('sirius-wiki-export')) return;
    const box = document.createElement('div'); box.id = 'sirius-wiki-export';
    box.style.cssText = 'position:fixed;inset:16px 16px auto;z-index:2147483647;padding:20px;background:white;color:black;border:1px solid #aaa;border-radius:12px;font:16px/1.5 system-ui;box-shadow:0 8px 40px #0004';
    const status = document.createElement('p');status.textContent = 'Загрузка расписания четырёх групп…';box.append(status);
    document.body.append(box);
    try {
      const data = await factory().collect({progress:text => status.textContent=text});
      const wiki = 'https://arduradiokot.github.io/sirius-it-wiki/';
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({type:'sirius-schedule', data}, wiki);
        window.close();
        return;
      }
      window.name = 'sirius-schedule:' + JSON.stringify(data);
      location.href = wiki + '#/schedule';
    } catch {
      status.textContent='Не удалось получить расписание. Проверьте, что сайт открывается и группы доступны. Обновите страницу и повторите попытку.';
      const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>box.remove();box.append(close);
    }
  }
  const api = createScheduleSource();
  api.bookmarklet = () => 'javascript:' + encodeURIComponent(`void (${exportOnOfficialSite.toString()})(${createScheduleSource.toString()});`);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SiriusSource = api;
})(typeof window !== 'undefined' ? window : globalThis);
