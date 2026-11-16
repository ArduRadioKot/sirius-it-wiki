(() => {
  const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' });
  const timeFormat = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const dayString = date => date.toISOString().slice(0, 10);

  function week(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const date = new Date(`${iso}T12:00:00Z`);
    if (!Number.isFinite(+date) || dayString(date) !== iso) return null;
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const from = dayString(date);
    date.setUTCDate(date.getUTCDate() + 6);
    return { from, to: dayString(date) };
  }

  const unescape = value => (value || '').replace(/\\([nN,;\\])/g, (_, char) => /n/i.test(char) ? '\n' : char).trim();

  function dateTime(property) {
    const [value, params] = property || [];
    const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/i.exec(value || '');
    if (!match) return NaN;
    const [, year, month, day, hour, minute, second, utc] = match;
    const zone = params.match(/(?:^|;)TZID="?([^;"]+)/i)?.[1];
    if (zone && !utc && !/^(Europe\/Moscow|UTC|Etc\/UTC)$/i.test(zone)) return NaN;
    const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
    const parsed = Date.parse(`${iso}Z`);
    if (!Number.isFinite(parsed) || !new Date(parsed).toISOString().startsWith(iso)) return NaN;
    return utc || /UTC$/i.test(zone || '') ? parsed : parsed - 3 * 3600000;
  }

  function duration(value) {
    const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value || '');
    return match ? (Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0)) * 1000 : NaN;
  }

  function parse(calendar, period) {
    if (!period || typeof calendar !== 'string' || calendar.length > 2 * 1024 * 1024 || week(period.from)?.to !== period.to) return null;
    const lines = calendar.trim().replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    if (lines[0]?.toUpperCase() !== 'BEGIN:VCALENDAR' || lines.at(-1)?.toUpperCase() !== 'END:VCALENDAR') return null;
    const rows = new Map();
    let event, inside = 0;
    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper === 'BEGIN:VEVENT') { if (event) return null; event = new Map(); continue; }
      if (!event) continue;
      if (upper.startsWith('BEGIN:')) { inside++; continue; }
      if (upper.startsWith('END:') && inside) { inside--; continue; }
      if (inside) continue;
      if (upper !== 'END:VEVENT') {
        const match = /^([\w-]+)([^:]*):(.*)$/.exec(line);
        if (match) event.set(match[1].toUpperCase(), [match[3], match[2]]);
        continue;
      }
      const value = name => event.get(name)?.[0];
      const cancelled = value('STATUS')?.toUpperCase() === 'CANCELLED';
      const allDay = /^\d{8}$/.test(value('DTSTART') || '');
      if (!cancelled && !allDay) {
        const from = dateTime(event.get('DTSTART'));
        const to = event.has('DTEND') ? dateTime(event.get('DTEND')) : from + duration(value('DURATION'));
        const title = unescape(value('SUMMARY'));
        if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || !title || event.has('RRULE') || event.has('RDATE')) return null;
        const date = dayFormat.format(from), start = timeFormat.format(from), end = timeFormat.format(to);
        if (date >= period.from && date <= period.to) {
          if (dayFormat.format(to) !== date || start >= end) return null;
          const room = unescape(value('LOCATION'));
          const details = unescape(value('DESCRIPTION'));
          const teachers = details.match(/(?:^|\n)Преподавател[ьи]:\s*([^\n]+)/i)?.[1]?.trim() || '';
          const kind = unescape(value('CATEGORIES')) || details.match(/(?:^|\n)Тип(?: занятия)?:\s*([^\n]+)/i)?.[1]?.trim() || '';
          const key = JSON.stringify([date, start, end, title, room]);
          const uid = (value('UID') || key).slice(0, 512);
          const hash = [...uid].reduce((state, char) => Math.imul(31, state) + char.codePointAt(0) | 0, 0);
          rows.set(key, { id: `lk-${date}-${start.replace(':', '')}-${hash >>> 0}`, date, start, end, title, room, kind, teachers, comment: '' });
        }
      }
      event = null;
    }
    if (event || !rows.size) return null;
    return { ...period, rows: [...rows.values()] };
  }

  const inWeek = (period, iso) => iso >= period.from && iso <= period.to;
  function merge(publicRows, personalWeeks) {
    const weeks = Object.values(personalWeeks);
    return [...publicRows.filter(lesson => !weeks.some(period => inWeek(period, lesson.date))), ...weeks.flatMap(period => period.rows)]
      .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  }

  const api = { week, parse, merge };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.SiriusAccountSchedule = api;
})();
