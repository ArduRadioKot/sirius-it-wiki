#!/bin/bash
# Deploy the schedule collector to Yandex Cloud Functions and hand its URL and a
# fresh access token to GitHub Actions. Needs the `yc` CLI (logged in) and `gh`.
#
#   bash cloud/yandex-function/deploy.sh
set -euo pipefail

NAME=sirius-schedule
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT

cp "$HERE/index.py" "$BUILD/index.py"
cp "$ROOT/scripts/update-schedule.py" "$BUILD/update_schedule.py"
(cd "$BUILD" && zip -q function.zip index.py update_schedule.py)

if ! yc serverless function get --name "$NAME" >/dev/null 2>&1; then
  yc serverless function create --name "$NAME" >/dev/null
fi
# Public URL; the function itself checks X-Schedule-Token.
yc serverless function allow-unauthenticated-invoke --name "$NAME" >/dev/null

TOKEN="$(openssl rand -hex 24)"
yc serverless function version create \
  --function-name "$NAME" \
  --runtime python312 \
  --entrypoint index.handler \
  --memory 128m \
  --execution-timeout 150s \
  --source-path "$BUILD/function.zip" \
  --environment "SCHEDULE_COLLECTOR_TOKEN=$TOKEN" >/dev/null

URL="https://functions.yandexcloud.net/$(yc serverless function get --name "$NAME" --format json | python3 -c 'import json,sys;print(json.load(sys.stdin)["id"])')"
(cd "$ROOT" && gh secret set SCHEDULE_COLLECTOR_URL --body "$URL" && gh secret set SCHEDULE_COLLECTOR_TOKEN --body "$TOKEN")
echo "Deployed $URL; saved SCHEDULE_COLLECTOR_URL and SCHEDULE_COLLECTOR_TOKEN as GitHub secrets."

echo 'Test run (takes up to a minute)...'
curl -sS --max-time 170 -H "X-Schedule-Token: $TOKEN" "$URL" | python3 -c '
import json, sys
body = sys.stdin.read()
try:
    groups = json.loads(body)["groups"]
except Exception:
    sys.exit("Collector failed: " + body[:300])
print("OK:", {g: len(v) for g, v in groups.items()})'
