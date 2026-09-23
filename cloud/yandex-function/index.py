"""Yandex Cloud Function: collect the timetable from a Russian IP and return it as JSON.

schedule.siriusuniversity.ru times out for non-Russian networks, including GitHub
Actions. The workflow calls this function and publishes what it returns.
deploy.sh bundles scripts/update-schedule.py next to this file as update_schedule.py.
"""
import hmac
import json
import os

import update_schedule


def handler(event, context):
    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    expected = os.environ.get('SCHEDULE_COLLECTOR_TOKEN', '')
    if not expected or not hmac.compare_digest(headers.get('x-schedule-token', ''), expected):
        return {'statusCode': 403, 'body': 'forbidden'}
    try:
        snapshot = update_schedule.collect()
    except Exception as error:
        return {'statusCode': 502, 'body': f'{type(error).__name__}: {update_schedule.brief_error(error)}'}
    if not update_schedule.valid_snapshot(snapshot):
        return {'statusCode': 502, 'body': 'invalid snapshot'}
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json; charset=utf-8'},
        'body': json.dumps(snapshot, ensure_ascii=False),
    }
