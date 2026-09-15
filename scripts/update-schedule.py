"""Read the university's public Livewire schedule; publish only complete snapshots."""
import datetime as dt
import hashlib
import html
import http.cookiejar
import json
from pathlib import Path
import re
import urllib.request

SOURCE = 'https://schedule.siriusuniversity.ru'
GROUPS = ['ИОП-ИТ-26/1', 'ИОП-ИТ-26/2']
ROOT = Path(__file__).resolve().parents[1]


def teacher_names(teachers):
    if isinstance(teachers, dict):
        if 'fio' in teachers:
            return teachers['fio']
        teachers = list(teachers.values())
    if isinstance(teachers, str):
        return teachers
    return ', '.join(t.get('fio', '') if isinstance(t, dict) else str(t) for t in (teachers or []))


def normalize(events, group):
    if not isinstance(events, (dict, list)):
        raise ValueError('Unexpected events format')
    result = {}
    for bucket in (events.values() if isinstance(events, dict) else events):
        if not isinstance(bucket, list):
            raise ValueError('Unexpected event bucket')
        for e in bucket:
            day = dt.datetime.strptime(e['date'], '%d.%m.%Y').date().isoformat()
            for field in ['startTime', 'endTime']:
                dt.datetime.strptime(e[field], '%H:%M')
            if e['startTime'] >= e['endTime'] or not e.get('discipline') or e.get('group') != group:
                raise ValueError('Invalid lesson')
            room = e.get('classroom') or e.get('place') or ''
            if room and len(room) % 2 == 0 and room[:len(room)//2] == room[len(room)//2:]:
                room = room[:len(room)//2]
            row = dict(date=day, start=e['startTime'], end=e['endTime'], title=e['discipline'],
                       kind=e.get('groupType') or '', room=room, address=e.get('address') or '',
                       teachers=teacher_names(e.get('teachers')),
                       comment=e.get('comment') or '')
            row['id'] = hashlib.sha256((group + json.dumps(row, ensure_ascii=False, sort_keys=True)).encode()).hexdigest()[:20]
            result[row['id']] = row
    return sorted(result.values(), key=lambda e: (e['date'], e['start'], e['title'], e['room']))


class Schedule:
    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        page = self.opener.open(SOURCE, timeout=45).read().decode()
        self.state = json.loads(html.unescape(re.search(r'wire:initial-data="([^"]+)', page)[1]))
        self.token = re.search(r"window.livewire_token = '([^']+)", page)[1]

    def call(self, method, params):
        payload = dict(fingerprint=self.state['fingerprint'], serverMemo=self.state['serverMemo'],
                       _token=self.token, updates=[dict(type='callMethod', payload=dict(id='schedule', method=method, params=params))])
        req = urllib.request.Request(SOURCE + '/livewire/message/main-grid', data=json.dumps(payload).encode(),
                                     headers={'Content-Type': 'application/json', 'X-Livewire': 'true'})
        response = json.loads(self.opener.open(req, timeout=45).read())
        memo = response['serverMemo']
        # Livewire sends a partial data object, while its checksum covers the full state.
        old_data = self.state['serverMemo']['data']
        old_data.update(memo.get('data', {}))
        self.state['serverMemo'].update(memo)
        self.state['serverMemo']['data'] = old_data
        return old_data


def collect():
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=3)))
    monday = now.date() - dt.timedelta(days=now.weekday())
    groups = {}
    for group in GROUPS:
        client = Schedule()
        data = client.call('set', [group])
        if data.get('group') != group or 'events' not in data:
            raise ValueError('Group not confirmed by source')
        lessons = normalize(data['events'], group)
        for _ in range(2):
            data = client.call('addWeek', [])
            lessons += normalize(data['events'], group)
        if any(not monday <= dt.date.fromisoformat(e['date']) <= monday + dt.timedelta(days=20) for e in lessons):
            raise ValueError('Source returned unexpected dates')
        groups[group] = sorted({e['id']: e for e in lessons}.values(), key=lambda e: (e['date'], e['start'], e['title']))
    return dict(version=1, source=SOURCE, updatedAt=now.isoformat(),
                fromDate=monday.isoformat(), toDate=(monday + dt.timedelta(days=20)).isoformat(), groups=groups)


if __name__ == '__main__':
    snapshot = collect()
    target = ROOT / 'data/schedule.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(target)
    print('Schedule updated:', {g: len(v) for g, v in snapshot['groups'].items()})
