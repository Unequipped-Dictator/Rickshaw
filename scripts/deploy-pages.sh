#!/usr/bin/env bash
# deploy-pages.sh — build the game and force-push dist/ to the gh-pages branch.
# After the FIRST deploy, enable once in GitHub:
#   Settings → Pages → Source: "Deploy from a branch" → branch: gh-pages, / (root)
# The site then lives at https://<owner>.github.io/Rickshaw/ and updates on every run.
#
# Usage:  GH_TOKEN=<token> bash scripts/deploy-pages.sh
set -euo pipefail
cd "$(dirname "$0")/.."

REPO="Unequipped-Dictator/Rickshaw"
TOKEN="${GH_TOKEN:?set GH_TOKEN=<your fine-grained token>}"

echo "==> building…"
npm run build

WORK="$(mktemp -d)"
cp -r dist/. "$WORK/"
cd "$WORK"
git init -q -b gh-pages
git config user.name "Unequipped-Dictator"
git config user.email "Unequipped-Dictator@users.noreply.github.com"
git add -A
git commit -qm "deploy: $(cd - >/dev/null && git log -1 --format='%h %s' 2>/dev/null || date -u +%FT%TZ)"
git remote add origin "https://x-access-token:${TOKEN}@github.com/${REPO}.git"
git push -q --force origin gh-pages
echo "==> pushed gh-pages. (first time: enable Pages in repo Settings → Pages → Deploy from branch → gh-pages)"
