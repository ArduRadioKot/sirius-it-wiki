#!/usr/bin/env python3
"""Local wiki server: no-cache static files plus a same-origin schedule proxy."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import argparse
from collections import OrderedDict
import importlib.util
import math
from pathlib import Path
import socket
import threading
from time import monotonic
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('update_schedule', Path(__file__).with_name('update-schedule.py'))
schedule = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schedule)

PROXY_PREFIX = '/__schedule'
ALLOWED = {'/', '/livewire/message/main-grid'}
NO_CACHE = {'.html', '.js', '.css', '.json', '.ics', '.webmanifest', ''}
PUBLIC_FILES = {
    'index.html', 'styles.css', 'theme.js', 'app.js', 'pwa.js', 'sw.js',
    'gestures.js', 'schedule.js', 'student-account.js', 'schedule-source.js', 'manifest.webmanifest',
    'content-index.json', 'robots.txt',
}
PUBLIC_DIRECTORIES = {'articles', 'life', 'courses', 'assets', 'data', 'vendor'}
MATERIAL_DIRECTORIES = {'articles', 'life', 'courses'}


class ReadingLimit:
    """Token bucket shared by article, course and attachment requests from one IP."""
    def __init__(self, burst=30, per_minute=30, max_clients=4096):
        self.burst = burst
        self.rate = per_minute / 60
        self.max_clients = max_clients
        self.clients = OrderedDict()
        self.lock = threading.Lock()

    def retry_after(self, client):
        with self.lock:
            now = monotonic()
            tokens, last = self.clients.pop(client, (self.burst, now))
            tokens = min(self.burst, tokens + (now - last) * self.rate)
            wait = 0 if tokens >= 1 else math.ceil((1 - tokens) / self.rate)
            self.clients[client] = (tokens - 1 if not wait else tokens, now)
            if len(self.clients) > self.max_clients:
                self.clients.popitem(last=False)
            return wait


def proxy_target(url_path):
    path = url_path.split('?', 1)[0]
    if path == PROXY_PREFIX:
        rest = '/'
    elif path.startswith(PROXY_PREFIX + '/'):
        rest = path[len(PROXY_PREFIX):] or '/'
    else:
        return None
    if rest not in ALLOWED:
        return None
    return schedule.SOURCE + rest


def lan_address():
    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(('8.8.8.8', 80))
        return probe.getsockname()[0]
    except OSError:
        return ''
    finally:
        probe.close()


class WikiHandler(SimpleHTTPRequestHandler):
    session = None
    lock = threading.Lock()
    reading_limit = ReadingLimit()
    reading_material = False

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        suffix = Path(self.path.split('?', 1)[0]).suffix
        if suffix in NO_CACHE or self.path.startswith(PROXY_PREFIX):
            self.send_header('Cache-Control', 'no-store, max-age=0')
            self.send_header('Pragma', 'no-cache')
        if self.reading_material:
            self.send_header('X-Robots-Tag', 'noindex, noarchive')
        super().end_headers()

    def send_head(self):
        self.reading_material = False
        file = Path(self.translate_path(self.path)).resolve()
        try:
            relative = file.relative_to(ROOT)
        except ValueError:
            self.send_error(404)
            return None
        parts = relative.parts
        if not parts:
            return super().send_head()
        if any(part.startswith('.') for part in parts) or not (
            (len(parts) == 1 and parts[0] in PUBLIC_FILES) or
            (parts[0] in PUBLIC_DIRECTORIES and file.is_file())
        ):
            self.send_error(404)
            return None
        self.reading_material = parts[0] in MATERIAL_DIRECTORIES
        is_course_shell = parts[:3] == ('courses', 'matan', 'assets')
        if self.reading_material and not is_course_shell:
            wait = self.reading_limit.retry_after(self.client_address[0])
            if wait:
                self.send_response(429)
                self.send_header('Retry-After', str(wait))
                self.send_header('Content-Length', '0')
                self.end_headers()
                return None
        return super().send_head()

    def do_GET(self):
        if self.path.startswith(PROXY_PREFIX):
            self.proxy()
            return
        super().do_GET()

    def do_POST(self):
        if self.path.startswith(PROXY_PREFIX):
            self.proxy()
            return
        self.send_error(405, 'Method Not Allowed')

    def proxy(self):
        target = proxy_target(self.path)
        if not target:
            self.send_error(404, 'Not Found')
            return
        length = int(self.headers.get('Content-Length') or 0)
        data = self.rfile.read(length) if length else None
        headers = {}
        if self.headers.get('Content-Type'):
            headers['Content-Type'] = self.headers['Content-Type']
        if self.headers.get('X-Livewire'):
            headers['X-Livewire'] = self.headers['X-Livewire']
        try:
            with self.lock:
                body = self.session.request(target, data=data, headers=headers or None)
        except urllib.error.URLError as error:
            self.send_error(502, 'Schedule source unavailable')
            self.log_error('Schedule proxy failed: %s', error.reason if hasattr(error, 'reason') else error)
            return
        content_type = 'application/json' if target.endswith('main-grid') else 'text/html; charset=UTF-8'
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser(description='Serve Sirius Wiki locally for Mac and iPhone.')
    parser.add_argument('port', nargs='?', type=int, default=8765)
    args = parser.parse_args()
    WikiHandler.session = schedule.CurlSession()
    server = ThreadingHTTPServer(('0.0.0.0', args.port), WikiHandler)
    host = lan_address()
    print(f'Serving {ROOT} without cache')
    print(f'  http://127.0.0.1:{args.port}/')
    if host:
        print(f'  http://{host}:{args.port}/   (iPhone, same Wi-Fi)')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == '__main__':
    main()
