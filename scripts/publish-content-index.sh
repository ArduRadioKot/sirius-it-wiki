#!/bin/bash
# Rebuild content-index.json and push to main when Markdown sources changed.
# Runs in GitHub Actions (.github/workflows/content-index.yml).

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
branch="${CONTENT_INDEX_BRANCH:-main}"

for attempt in 1 2 3; do
  git fetch -q origin "$branch"
  git reset -q --hard "origin/$branch"

  node generate-index.mjs

  if git diff --quiet -- content-index.json; then
    echo 'content-index.json already matches Markdown sources.'
    exit 0
  fi

  git add content-index.json
  git -c user.name="${GIT_AUTHOR_NAME:-github-actions[bot]}" \
      -c user.email="${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}" \
      commit -q -m "Rebuild content-index.json from Markdown sources."
  if git push -q origin "HEAD:$branch"; then
    echo "Index published ($(git rev-parse --short HEAD))."
    exit 0
  fi
  echo "Push attempt $attempt failed, retrying from the latest $branch." >&2
  sleep $((attempt * 10))
done

echo 'Could not push content-index.json after 3 attempts.' >&2
exit 1
