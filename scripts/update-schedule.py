"""Read the university's public Livewire schedule; publish only complete snapshots."""
import datetime as dt
import hashlib
import html
import http.cookiejar
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import time
import sys
import urllib.error
import urllib.request
import urllib.parse

SOURCE = 'https://schedule.siriusuniversity.ru'
GROUPS = ['ИОП-ИТ-26/1', 'ИОП-ИТ-26/2', 'ИОП-ИТ-25/1', 'ИОП-ИТ-25/2']
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


BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'


BIND_NAME = re.compile(r'^[A-Za-z][A-Za-z0-9._-]{0,31}$')
TUNNEL_PREFIXES = ('utun', 'tun', 'wg', 'ppp', 'ipsec', 'tailscale', 'zt')


def validated_proxy():
    proxy = os.environ.get('SCHEDULE_PROXY_URL', '').strip()
    if not proxy:
        return ''
    try:
        url = urllib.parse.urlsplit(proxy)
        if url.scheme not in ('http', 'https') or not url.hostname or url.path not in ('', '/') or url.query or url.fragment:
            raise ValueError()
        _ = url.port
    except ValueError:
        # Never put the URL in errors: it may contain proxy credentials.
        raise ValueError('SCHEDULE_PROXY_URL must be an HTTP(S) proxy URL') from None
    return proxy


def validated_bind():
    value = os.environ.get('SCHEDULE_BIND', '').strip()
    if not value:
        return ''
    try:
        socket.inet_aton(value)
        return value
    except OSError:
        pass
    if BIND_NAME.match(value):
        return value
    raise ValueError('SCHEDULE_BIND must be a local interface name or IPv4 address')


def default_route_is_tunnel():
    try:
        out = subprocess.check_output(['route', '-n', 'get', 'default'], text=True, stderr=subprocess.DEVNULL, timeout=2)
    except (OSError, subprocess.SubprocessError):
        return False
    for line in out.splitlines():
        if line.strip().lower().startswith('interface:'):
            return line.split(':', 1)[1].strip().startswith(TUNNEL_PREFIXES)
    return False


def first_lan_interface():
    try:
        out = subprocess.check_output(['ifconfig'], text=True, stderr=subprocess.DEVNULL, timeout=2)
    except (OSError, subprocess.SubprocessError):
        return ''
    skip = True
    for line in out.splitlines():
        if line and not line[:1].isspace():
            name = line.split(':', 1)[0]
            skip = name.startswith(('lo', 'awdl', 'llw', 'bridge', 'gif', 'stf', 'ap') + TUNNEL_PREFIXES)
            continue
        if skip or 'inet ' not in line:
            continue
        ip = line.split()[1]
        if ip.startswith('addr:'):
            ip = ip[5:]
        try:
            socket.inet_aton(ip)
        except OSError:
            continue
        if not ip.startswith('127.'):
            return name
    return ''


def curl_bind_interface():
    explicit = validated_bind()
    if explicit:
        return explicit
    if validated_proxy():
        return ''
    if default_route_is_tunnel():
        return first_lan_interface()
    return ''


def brief_error(error):
    text = str(getattr(error, 'reason', None) or error)
    text = re.sub(r'//[^/\s@:]+:[^/\s@]+@', '//***@', text)
    return text.replace('\n', ' ')[:240]


def schedule_opener():
    handlers = [urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())]
    proxy = validated_proxy()
    if proxy:
        handlers.append(urllib.request.ProxyHandler({'https': proxy}))
    return urllib.request.build_opener(*handlers)


class CurlSession:
    """QRATOR times out Python's TLS handshake; curl from the same machine works."""

    def __init__(self):
        handle = tempfile.NamedTemporaryFile(prefix='sirius-schedule-', suffix='.cookies', delete=False)
        handle.close()
        self.cookies = handle.name
        self.proxy = validated_proxy()
        self.bind = curl_bind_interface()

    def request(self, url, data=None, headers=None, timeout=30):
        curl = shutil.which('curl')
        last_error = None
        for attempt in range(3):
            try:
                if not curl:
                    return self._urllib(url, data, headers, timeout)
                command = [curl, '-sS', '--fail', '--http1.1', '--max-time', str(timeout),
                           '-A', BROWSER_UA, '-b', self.cookies, '-c', self.cookies]
                if self.bind:
                    command += ['--interface', self.bind]
                if self.proxy:
                    command += ['-x', self.proxy]
                for key, value in (headers or {}).items():
                    command += ['-H', f'{key}: {value}']
                if data is not None:
                    command += ['--data-binary', '@-']
                command.append(url)
                completed = subprocess.run(command, input=data, capture_output=True, timeout=timeout + 5)
            except (OSError, subprocess.TimeoutExpired) as error:
                last_error = error
            else:
                if completed.returncode == 0:
                    return completed.stdout
                last_error = completed.stderr.decode('utf-8', 'replace').strip() or f'curl exit {completed.returncode}'
            if attempt < 2:
                time.sleep(1.5 * (attempt + 1))
        raise urllib.error.URLError(last_error)

    def _urllib(self, url, data, headers, timeout):
        opener = schedule_opener()
        request = urllib.request.Request(url, data=data, headers={'User-Agent': BROWSER_UA, **(headers or {})})
        with opener.open(request, timeout=timeout) as response:
            return response.read()


class Schedule:
    def __init__(self, session=None):
        self.session = session or CurlSession()
        page = self.session.request(SOURCE, timeout=30).decode()
        self.state = json.loads(html.unescape(re.search(r'wire:initial-data="([^"]+)', page)[1]))
        self.token = re.search(r"window.livewire_token = '([^']+)", page)[1]

    def call(self, method, params):
        payload = dict(fingerprint=self.state['fingerprint'], serverMemo=self.state['serverMemo'],
                       _token=self.token, updates=[dict(type='callMethod', payload=dict(id='schedule', method=method, params=params))])
        response = json.loads(self.session.request(
            SOURCE + '/livewire/message/main-grid',
            data=json.dumps(payload).encode(),
            headers={'Content-Type': 'application/json', 'X-Livewire': 'true'},
            timeout=30,
        ))
        memo = response['serverMemo']
        if memo.get('errors'):
            raise ValueError('Source reported an error')
        # Livewire sends a partial data object, while its checksum covers the full state.
        old_data = self.state['serverMemo']['data']
        old_data.update(memo.get('data', {}))
        self.state['serverMemo'].update(memo)
        self.state['serverMemo']['data'] = old_data
        return old_data


def collect():
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=3)))
    monday = now.date() - dt.timedelta(days=now.weekday())
    session = CurlSession()
    groups = {}
    for group in GROUPS:
        client = Schedule(session)
        data = client.call('set', [group])
        if data.get('group') != group or 'events' not in data:
            raise ValueError('Group not confirmed by source')
        lessons = []
        for week in range(3):
            if week:
                data = client.call('addWeek', [])
            if data.get('group') != group:
                raise ValueError('Source changed the selected group')
            rows = normalize(data['events'], group)
            first = monday + dt.timedelta(days=week * 7)
            if any(not first <= dt.date.fromisoformat(e['date']) <= first + dt.timedelta(days=6) for e in rows):
                raise ValueError('Source returned the wrong week')
            lessons += rows
        groups[group] = sorted({e['id']: e for e in lessons}.values(), key=lambda e: (e['date'], e['start'], e['title']))
    return dict(version=1, source=SOURCE, updatedAt=now.isoformat(),
                fromDate=monday.isoformat(), toDate=(monday + dt.timedelta(days=20)).isoformat(), groups=groups)


def remote_collect():
    """Ask the Russian-hosted collector (cloud/yandex-function) for a snapshot.

    The university site only answers Russian IPs, so GitHub Actions cannot scrape it directly.
    """
    url = os.environ['SCHEDULE_COLLECTOR_URL'].strip()
    if urllib.parse.urlsplit(url).scheme != 'https':
        raise ValueError('SCHEDULE_COLLECTOR_URL must be an HTTPS URL')
    request = urllib.request.Request(url, headers={
        'User-Agent': 'sirius-wiki-schedule',
        'X-Schedule-Token': os.environ.get('SCHEDULE_COLLECTOR_TOKEN', '').strip(),
    })
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        # 'forbidden' comes from our token check; Yandex's own JSON means the function is not public.
        body = error.read(300).decode('utf-8', 'replace').replace('\n', ' ')
        raise urllib.error.URLError(f'HTTP {error.code}: {body}') from None


def valid_snapshot(data, require_all=True):
    """Only a usable last-good snapshot may replace a failed source request."""
    try:
        if data['version'] != 1:
            return False
        dt.datetime.fromisoformat(data['updatedAt'])
        first, last = (dt.date.fromisoformat(data[k]) for k in ('fromDate', 'toDate'))
        if first > last:
            return False
        present = [group for group in GROUPS if group in data['groups']]
        if not present or (require_all and len(present) != len(GROUPS)):
            return False
        for group in present:
            rows = data['groups'][group]
            if not isinstance(rows, list):
                return False
            for row in rows:
                if not first <= dt.date.fromisoformat(row['date']) <= last:
                    return False
                if not row['id'] or not row['title']:
                    return False
                start = dt.datetime.strptime(row['start'], '%H:%M')
                end = dt.datetime.strptime(row['end'], '%H:%M')
                if start >= end:
                    return False
        return True
    except (KeyError, TypeError, ValueError):
        return False


def calendar_slug(group):
    return group.replace('ИОП-ИТ-', 'iop-it-').replace('/', '-')


def ics_escape(text):
    return str(text or '').replace('\\', '\\\\').replace('\r\n', '\\n').replace('\n', '\\n').replace(';', '\\;').replace(',', '\\,')


def ics_stamp(moment):
    return moment.astimezone(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')


def fold_ics_line(line):
    out = ''
    length = 0
    for char in line:
        size = len(char.encode('utf-8'))
        if length + size > 74:
            out += '\r\n '
            length = 1
        out += char
        length += size
    return out


def build_ics(group, events, lead=10, now=None):
    """RFC 5545 feed for Google Calendar and Notion Calendar subscription."""
    now = now or dt.datetime.now(dt.timezone.utc)
    moscow = dt.timezone(dt.timedelta(hours=3))
    lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Sirius Wiki//Schedule//RU',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        f'X-WR-CALNAME:Сириус {group}',
        'X-WR-TIMEZONE:Europe/Moscow',
        'REFRESH-INTERVAL;VALUE=DURATION:PT4H',
        'X-PUBLISHED-TTL:PT4H',
    ]
    for event in events:
        start = dt.datetime.fromisoformat(f"{event['date']}T{event['start']}:00").replace(tzinfo=moscow)
        end = dt.datetime.fromisoformat(f"{event['date']}T{event['end']}:00").replace(tzinfo=moscow)
        description = f"{group} · {event.get('teachers', '')}\n{event.get('kind', '')}\n{event.get('comment', '')}"
        lines.extend([
            'BEGIN:VEVENT',
            f"UID:{event['id']}@sirius-wiki",
            f'DTSTAMP:{ics_stamp(now)}',
            f'DTSTART:{ics_stamp(start)}',
            f'DTEND:{ics_stamp(end)}',
            f"SUMMARY:{ics_escape(event.get('title', ''))}",
            f"LOCATION:{ics_escape(event.get('room', ''))}",
            f'DESCRIPTION:{ics_escape(description)}',
            'BEGIN:VALARM',
            f'TRIGGER:-PT{lead}M',
            'ACTION:DISPLAY',
            f"DESCRIPTION:{ics_escape(event.get('title', ''))}",
            'END:VALARM',
            'END:VEVENT',
        ])
    lines.append('END:VCALENDAR')
    return ''.join(fold_ics_line(line) + '\r\n' for line in lines)


def publish_calendars(snapshot, directory):
    folder = Path(directory) / 'calendars'
    folder.mkdir(parents=True, exist_ok=True)
    now = dt.datetime.now(dt.timezone.utc)
    for group in GROUPS:
        events = snapshot.get('groups', {}).get(group) or []
        path = folder / f'{calendar_slug(group)}.ics'
        temporary = path.with_suffix('.tmp')
        temporary.write_bytes(build_ics(group, events, now=now).encode('utf-8'))
        temporary.replace(path)


def update(target=None, fetch_snapshot=collect, sleep=time.sleep):
    target = target or ROOT / 'data/schedule.json'
    for attempt in range(3):
        try:
            # Start with fresh cookies and Livewire state on every retry. Replaying
            # addWeek after a lost response could otherwise skip an entire week.
            snapshot = fetch_snapshot()
            if not valid_snapshot(snapshot):
                raise ValueError('Invalid complete snapshot')
            break
        except Exception as error:
            print(f'Schedule attempt {attempt + 1}/3 failed ({type(error).__name__}: {brief_error(error)}).', file=sys.stderr)
            if attempt < 2:
                sleep((5, 15)[attempt])
    else:
        try:
            saved = json.loads(target.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            saved = None
        if not valid_snapshot(saved, require_all=False):
            raise RuntimeError('Schedule unavailable and no valid saved snapshot exists')
        print('::warning::University schedule unavailable after 3 attempts. Keeping the last successful snapshot and its timestamp.')
        publish_calendars(saved, target.parent)
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(target)
    publish_calendars(snapshot, target.parent)
    print('Schedule updated:', {g: len(v) for g, v in snapshot['groups'].items()})
    return True


if __name__ == '__main__':
    update(fetch_snapshot=remote_collect if os.environ.get('SCHEDULE_COLLECTOR_URL', '').strip() else collect)
