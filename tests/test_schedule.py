import importlib.util
from pathlib import Path
import unittest
import tempfile
import json
import subprocess
from unittest.mock import Mock, patch
spec=importlib.util.spec_from_file_location('schedule',Path(__file__).resolve().parents[1]/'scripts/update-schedule.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class ScheduleTests(unittest.TestCase):
    def event(self,**extra):
        return dict(date='15.09.2026',startTime='08:45',endTime='10:05',discipline='Физика',group=m.GROUPS[0],teachers={},**extra)
    def test_subgroups_and_duplicate_events(self):
        a=self.event(classroom='Альфа 5.8Альфа 5.8');b=self.event(classroom='Бета 2.3')
        rows=m.normalize({'a':[a,a,b]},m.GROUPS[0]);self.assertEqual(len(rows),2);self.assertEqual(rows[0]['date'],'2026-09-15');self.assertIn('Альфа 5.8',[r['room'] for r in rows])
    def test_reject_wrong_group_and_bad_dates(self):
        a=self.event();a['group']=m.GROUPS[1]
        with self.assertRaises(ValueError):m.normalize({'a':[a]},m.GROUPS[0])
        a=self.event();a['date']='31.02.2026'
        with self.assertRaises(ValueError):m.normalize({'a':[a]},m.GROUPS[0])
    def test_empty_week(self):self.assertEqual(m.normalize([],m.GROUPS[0]),[])

    def snapshot(self):
        return dict(version=1, updatedAt='2026-09-21T12:00:00+03:00', fromDate='2026-09-21', toDate='2026-10-11', groups={g: [] for g in m.GROUPS})
    def test_retry_recovers_and_writes_complete_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'schedule.json'
            fetch=Mock(side_effect=[TimeoutError(), ValueError('broken JSON'), self.snapshot()])
            sleep=Mock()
            self.assertTrue(m.update(target, fetch, sleep))
            self.assertEqual(json.loads(target.read_text()), self.snapshot())
            self.assertEqual(fetch.call_count, 3)
            self.assertEqual([c.args[0] for c in sleep.call_args_list], [5,15])
    def test_failure_keeps_old_bytes_and_timestamp(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'schedule.json'
            original=json.dumps(self.snapshot())
            target.write_text(original)
            self.assertFalse(m.update(target, Mock(side_effect=TimeoutError()), Mock()))
            self.assertEqual(target.read_text(), original)
    def test_partial_snapshot_is_never_published(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'schedule.json'
            original=json.dumps(self.snapshot());target.write_text(original)
            partial=self.snapshot();del partial['groups'][m.GROUPS[1]]
            self.assertFalse(m.update(target, Mock(return_value=partial), Mock()))
            self.assertEqual(target.read_text(), original)
    def test_failure_without_backup_is_explicit(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'schedule.json'
            with self.assertRaises(RuntimeError):m.update(target, Mock(side_effect=TimeoutError()), Mock())
            self.assertFalse(target.exists())


    def test_repeated_week_is_rejected(self):
        now=m.dt.datetime.now(m.dt.timezone(m.dt.timedelta(hours=3)))
        monday=now.date()-m.dt.timedelta(days=now.weekday())
        event=self.event();event['date']=monday.strftime('%d.%m.%Y')
        client=Mock()
        client.call.return_value={'group':m.GROUPS[0], 'events':{'a':[event]}}
        with patch.object(m, 'Schedule', return_value=client):
            with self.assertRaisesRegex(ValueError, 'wrong week'):m.collect()


    def test_both_2025_groups_are_supported(self):
        for group in ['ИОП-ИТ-25/1', 'ИОП-ИТ-25/2']:
            self.assertIn(group, m.GROUPS)
            event=self.event();event['group']=group
            self.assertEqual(len(m.normalize({'a':[event]},group)),1)
    def test_legacy_snapshot_is_only_valid_as_backup(self):
        saved=self.snapshot()
        del saved['groups']['ИОП-ИТ-25/1'];del saved['groups']['ИОП-ИТ-25/2']
        self.assertFalse(m.valid_snapshot(saved))
        self.assertTrue(m.valid_snapshot(saved, require_all=False))


    def test_proxy_is_scoped_to_https_and_keeps_cookie_session(self):
        with patch.dict(m.os.environ, {'SCHEDULE_PROXY_URL':'http://user:password@proxy.example:3128'}):
            with patch.object(m.urllib.request, 'build_opener') as build:
                m.schedule_opener()
                handlers=build.call_args.args
                self.assertTrue(any(isinstance(h, m.urllib.request.HTTPCookieProcessor) for h in handlers))
                proxy=next(h for h in handlers if isinstance(h,m.urllib.request.ProxyHandler))
                self.assertEqual(proxy.proxies, {'https':'http://user:password@proxy.example:3128'})
    def test_bad_proxy_does_not_expose_credentials(self):
        with patch.dict(m.os.environ, {'SCHEDULE_PROXY_URL':'socks5://user:private-password@proxy.example:1080'}):
            with self.assertRaises(ValueError) as error:m.schedule_opener()
            self.assertNotIn('private-password',str(error.exception))
    def test_no_proxy_keeps_default_network_configuration(self):
        with patch.dict(m.os.environ, {'SCHEDULE_PROXY_URL':''}):
            with patch.object(m.urllib.request, 'build_opener') as build:
                m.schedule_opener()
                self.assertEqual(len(build.call_args.args),1)
    def test_curl_session_uses_http11_and_proxy(self):
        with patch.dict(m.os.environ, {'SCHEDULE_PROXY_URL':'http://user:password@proxy.example:3128'}):
            with patch.object(m.shutil, 'which', return_value='/usr/bin/curl'):
                with patch.object(m.subprocess, 'run') as run:
                    run.return_value=subprocess.CompletedProcess(args=[], returncode=0, stdout=b'ok', stderr=b'')
                    self.assertEqual(m.CurlSession().request(m.SOURCE), b'ok')
                    command=run.call_args.args[0]
                    self.assertIn('--http1.1', command)
                    self.assertIn('-x', command)
                    self.assertIn('http://user:password@proxy.example:3128', command)
                    self.assertNotIn('--interface', command)
                    self.assertNotIn('socks5', ' '.join(command))
    def test_curl_session_binds_local_interface(self):
        with patch.dict(m.os.environ, {'SCHEDULE_BIND':'en0', 'SCHEDULE_PROXY_URL':''}):
            with patch.object(m.shutil, 'which', return_value='/usr/bin/curl'):
                with patch.object(m.subprocess, 'run') as run:
                    run.return_value=subprocess.CompletedProcess(args=[], returncode=0, stdout=b'ok', stderr=b'')
                    m.CurlSession().request(m.SOURCE)
                    command=run.call_args.args[0]
                    self.assertEqual(command[command.index('--interface')+1], 'en0')
    def test_lan_interface_skips_tunnels_and_uses_device_name(self):
        sample='\n'.join([
            'lo0: flags=8049','\tinet 127.0.0.1 netmask 0xff000000',
            'utun15: flags=8051','\tinet 198.18.0.1 --> 198.18.0.1',
            'en0: flags=8863','\tinet 10.82.191.54 netmask 0xffff0000',
        ])+'\n'
        with patch.object(m.subprocess,'check_output', return_value=sample):
            self.assertEqual(m.first_lan_interface(), 'en0')
    def test_bad_bind_is_rejected(self):
        with patch.dict(m.os.environ, {'SCHEDULE_BIND':'-o/tmp/x'}):
            with self.assertRaises(ValueError):
                m.validated_bind()
    def test_brief_error_hides_proxy_credentials(self):
        hidden=m.brief_error(m.urllib.error.URLError('Failed to connect to http://user:private-password@proxy.example:3128'))
        self.assertNotIn('private-password', hidden)
        self.assertIn('***@', hidden)
    def test_local_proxy_only_forwards_schedule_paths(self):
        spec=importlib.util.spec_from_file_location('serve', Path(__file__).resolve().parents[1]/'scripts/serve.py')
        serve=importlib.util.module_from_spec(spec);spec.loader.exec_module(serve)
        self.assertEqual(serve.proxy_target('/__schedule'), m.SOURCE+'/')
        self.assertEqual(serve.proxy_target('/__schedule/livewire/message/main-grid'), m.SOURCE+'/livewire/message/main-grid')
        self.assertIsNone(serve.proxy_target('/__schedule/../secret'))
        self.assertIsNone(serve.proxy_target('/index.html'))

    def test_calendar_feed_uses_moscow_times_and_stable_uids(self):
        row=m.normalize({'a':[self.event()]}, m.GROUPS[0])[0]
        now=m.dt.datetime(2026,9,15,12,tzinfo=m.dt.timezone.utc)
        ics=m.build_ics(m.GROUPS[0], [row], now=now)
        self.assertIn('DTSTART:20260915T054500Z', ics)
        self.assertIn('METHOD:PUBLISH', ics)
        self.assertIn(f"UID:{row['id']}@sirius-wiki", ics)
        self.assertIn('REFRESH-INTERVAL;VALUE=DURATION:PT4H', ics)
        self.assertEqual(m.calendar_slug(m.GROUPS[0]), 'iop-it-26-1')
        for line in ics.split('\r\n'):
            self.assertLessEqual(len(line.encode()), 75)

    def test_update_publishes_group_calendars(self):
        with tempfile.TemporaryDirectory() as directory:
            target=Path(directory)/'schedule.json'
            snapshot=self.snapshot()
            snapshot['groups'][m.GROUPS[0]]=[{
                'id':'abc','date':'2026-09-21','start':'08:45','end':'10:05',
                'title':'Физика','kind':'Лекция','room':'Альфа','teachers':'','comment':''
            }]
            self.assertTrue(m.update(target, Mock(return_value=snapshot), Mock()))
            ics=(Path(directory)/'calendars'/'iop-it-26-1.ics').read_text(encoding='utf-8')
            self.assertIn('SUMMARY:Физика', ics)
            self.assertTrue((Path(directory)/'calendars'/'iop-it-25-2.ics').exists())

    def test_remote_collector_sends_token_and_requires_https(self):
        response=Mock();response.read.return_value=json.dumps(self.snapshot()).encode()
        response.__enter__=Mock(return_value=response);response.__exit__=Mock(return_value=False)
        env={'SCHEDULE_COLLECTOR_URL':'https://functions.yandexcloud.net/abc','SCHEDULE_COLLECTOR_TOKEN':'secret'}
        with patch.dict(m.os.environ,env),patch.object(m.urllib.request,'urlopen',return_value=response) as urlopen:
            self.assertEqual(m.remote_collect(),self.snapshot())
        self.assertEqual(urlopen.call_args.args[0].get_header('X-schedule-token'),'secret')
        with patch.dict(m.os.environ,{'SCHEDULE_COLLECTOR_URL':'http://example.com'}),self.assertRaises(ValueError):m.remote_collect()
    def test_remote_collector_error_shows_response_body(self):
        import io
        error=m.urllib.error.HTTPError('https://x',403,'Forbidden',{},io.BytesIO(b'forbidden'))
        with patch.dict(m.os.environ,{'SCHEDULE_COLLECTOR_URL':'https://x'}),patch.object(m.urllib.request,'urlopen',side_effect=error):
            with self.assertRaises(m.urllib.error.URLError) as caught:m.remote_collect()
        self.assertEqual(m.brief_error(caught.exception),'HTTP 403: forbidden')

class CollectorFunctionTests(unittest.TestCase):
    def setUp(self):
        import sys
        sys.modules['update_schedule']=m
        spec=importlib.util.spec_from_file_location('collector',Path(__file__).resolve().parents[1]/'cloud/yandex-function/index.py')
        self.f=importlib.util.module_from_spec(spec);spec.loader.exec_module(self.f)
    def test_rejects_missing_or_wrong_token(self):
        with patch.dict(m.os.environ,{'SCHEDULE_COLLECTOR_TOKEN':'secret'}),patch.object(m,'collect') as collect:
            self.assertEqual(self.f.handler({'headers':{}},None)['statusCode'],403)
            self.assertEqual(self.f.handler({'headers':{'X-Schedule-Token':'nope'}},None)['statusCode'],403)
            collect.assert_not_called()
    def test_returns_valid_snapshot(self):
        snap=ScheduleTests.snapshot(None)
        with patch.dict(m.os.environ,{'SCHEDULE_COLLECTOR_TOKEN':'secret'}),patch.object(m,'collect',return_value=snap):
            out=self.f.handler({'headers':{'X-Schedule-Token':'secret'}},None)
        self.assertEqual(out['statusCode'],200);self.assertEqual(json.loads(out['body']),snap)
    def test_source_errors_become_502(self):
        with patch.dict(m.os.environ,{'SCHEDULE_COLLECTOR_TOKEN':'secret'}),patch.object(m,'collect',side_effect=TimeoutError()):
            self.assertEqual(self.f.handler({'headers':{'x-schedule-token':'secret'}},None)['statusCode'],502)

if __name__=='__main__':unittest.main()
