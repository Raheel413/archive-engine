#!/usr/bin/env bash
# Mac/Linux version of run.ps1:  ./hunt/run.sh mcqueen [--redo b05-0] [--only soundbite] [--browser firefox]
set -e
cd "$(dirname "$0")/.."
film="$1"; shift
git pull --rebase
[ -d node_modules ] || npm ci --no-audit --no-fund
[ -d .venv ] || python3 -m venv .venv
.venv/bin/pip install -q --upgrade -r hunt/requirements.txt
node scripts/assets.mjs pull "films/$film"
.venv/bin/python hunt/hunt.py "films/$film" "$@"
node scripts/validate.mjs "films/$film" --allow-missing || true
node scripts/assets.mjs push "films/$film"
git add "films/$film/film.json" "films/$film/credits.md"; git commit -m "hunt: $film" || true; git push
