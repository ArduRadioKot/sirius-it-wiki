const { test } = require('node:test');
const assert = require('node:assert/strict');
const schedule = require('../account-schedule.js');

const period = { from: '2026-11-16', to: '2026-11-22' };
const calendar = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flat(), 'END:VCALENDAR'].join('\r\n');
const event = (...fields) => ['BEGIN:VEVENT', ...fields, 'END:VEVENT'];

test('iCalendar lessons keep Moscow dates, times and original text', () => {
  assert.deepEqual(schedule.week('2026-11-18'), period);
  const data = calendar(event('UID:a', 'DTSTART:20261116T064500Z', 'DTEND:20261116T080500Z',
    'SUMMARY:Линейная алгеб', ' ра', 'LOCATION:Кампус\\, 4',
    'DESCRIPTION:Тип: Лекция\\nПреподаватель: Иванов',
    'BEGIN:VALARM', 'DESCRIPTION:Напоминание', 'END:VALARM'),
  event('UID:b', 'DTSTART;TZID=Europe/Moscow:20261117T130000', 'DURATION:PT1H20M', 'SUMMARY:Практика'));
  const { rows } = schedule.parse(data, period);
  assert.deepEqual(rows.map(({ date, start, end, title }) => [date, start, end, title]), [
    ['2026-11-16', '09:45', '11:05', 'Линейная алгебра'],
    ['2026-11-17', '13:00', '14:20', 'Практика'],
  ]);
  assert.equal(rows[0].room, 'Кампус, 4');
  assert.equal(rows[0].teachers, 'Иванов');
  assert.equal(rows[0].kind, 'Лекция');
});

test('failed and empty exports cannot hide the public schedule', () => {
  assert.equal(schedule.parse('<html>Вход</html>', period), null);
  assert.equal(schedule.parse(calendar(), period), null);
  assert.equal(schedule.parse(calendar(event('DTSTART:20261116T100000', 'SUMMARY:Без времени окончания')), period), null);
  assert.equal(schedule.parse(calendar(), null), null);
});

test('a valid personal week replaces only that week, including days without personal classes', () => {
  const feed = schedule.parse(calendar(event('UID:a', 'DTSTART:20261116T090000', 'DTEND:20261116T102000', 'SUMMARY:Личная пара'),
    event('UID:cancelled', 'STATUS:CANCELLED', 'DTSTART:20261117T090000', 'DTEND:20261117T102000', 'SUMMARY:Отменено')), period);
  const published = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-23'].map(date => ({ date, start: '09:00', end: '10:20', title: 'Групповая пара' }));
  assert.deepEqual(schedule.merge(published, { [period.from]: feed }).map(e => [e.date, e.title]), [
    ['2026-11-15', 'Групповая пара'], ['2026-11-16', 'Личная пара'], ['2026-11-23', 'Групповая пара'],
  ]);
});
