#!/bin/sh
# Builds the live site and publishes it to GitHub Pages (the gh-pages branch of this repository).
# The branch holds only the built site; main keeps the code. Usage: sh publish_site.sh
set -e
cd "$(dirname "$0")"
python3 build_site.py
REMOTE=$(git remote get-url origin)
cd site
rm -rf .git
git init -q -b gh-pages
git add -A
git commit -q -m "Live site build $(date '+%Y-%m-%d %H:%M')"
git push -q -f "$REMOTE" gh-pages
rm -rf .git
echo "Published. It can take a minute or two to appear at https://omzugo.github.io/corpse-prototype/"
