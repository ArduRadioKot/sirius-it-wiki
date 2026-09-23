#!/bin/bash
# Refresh data/schedule.json and push it to main, but only when something changed.
# Runs in GitHub Actions (.github/workflows/schedule.yml). It hard-resets the checkout,
# so outside CI it refuses to run unless SCHEDULE_BOT_CHECKOUT=1 marks a throwaway clone.
#
# Everything lives in main() so `git reset --hard` rewriting this file mid-run is safe.

main() {
  set -euo pipefail
  if [ -z "${CI:-}" ] && [ -z "${SCHEDULE_BOT_CHECKOUT:-}" ]; then
    echo 'Refusing to run: this script resets the checkout. Set SCHEDULE_BOT_CHECKOUT=1 only in a throwaway clone.' >&2
    exit 2
  fi
  cd "$(git rev-parse --show-toplevel)"
  local branch="${SCHEDULE_BRANCH:-main}"

  for attempt in 1 2 3; do
    git fetch -q origin "$branch"
    git reset -q --hard "origin/$branch"
    git show HEAD:data/schedule.json > "${TMPDIR:-/tmp}/schedule-before.json"

    python3 scripts/update-schedule.py

    if ! python3 - "${TMPDIR:-/tmp}/schedule-before.json" data/schedule.json <<'PY'
import datetime as dt, json, sys
old, new = (json.load(open(p, encoding='utf-8')) for p in sys.argv[1:3])
if old['updatedAt'] == new['updatedAt']:
    sys.exit(1)  # source unavailable: the old snapshot was kept
keys = ('fromDate', 'toDate', 'groups')
changed = any(old.get(k) != new.get(k) for k in keys)
# The app treats snapshots older than a day as stale, so refresh the timestamp twice a day.
age = dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(old['updatedAt'])
sys.exit(0 if changed or age > dt.timedelta(hours=12) else 1)
PY
    then
      echo 'Schedule unchanged, nothing to publish.'
      git checkout -q -- data
      return 0
    fi

    git add data/schedule.json data/calendars
    git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name || echo schedule-bot)}" \
        -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email || echo schedule-bot@users.noreply.github.com)}" \
        commit -q -m "Refresh the timetable snapshot from the university site."
    if git push -q origin "HEAD:$branch"; then
      echo "Schedule published ($(git rev-parse --short HEAD))."
      return 0
    fi
    echo "Push attempt $attempt failed, retrying from the latest $branch." >&2
    sleep $((attempt * 10))
  done
  echo 'Could not push the schedule after 3 attempts.' >&2
  return 1
}

main "$@"
exit
