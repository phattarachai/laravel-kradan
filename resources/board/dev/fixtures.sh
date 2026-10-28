#!/usr/bin/env bash
# Copies real review pages from a local project's public/design/ into dev/fixtures/local/ (gitignored:
# they hold that project's data, and this repo is public). The dev server picks them up when present.
#
#   bash resources/board/dev/fixtures.sh path/to/public/design
set -euo pipefail
src="${1:?usage: fixtures.sh path/to/public/design}"
dst="$(cd "$(dirname "$0")" && pwd)/fixtures/local"
rm -rf "$dst" && mkdir -p "$dst"
copy() { [[ -f "$src/$1" ]] && mkdir -p "$dst/$2" && cp "$src/$1" "$dst/$2/index.html" && echo "fixture → $2"; }
# V2 Launchpad search: rounds/01 is the first round, the page itself the second
copy 2610-22-launchpad-search/rounds/01/index.html launchpad-search/1
copy 2610-22-launchpad-search/index.html launchpad-search/2
copy 2610-21-ws1-roundup/index.html ws1-roundup/1
copy 2610-16-leave-cover-flow/index.html leave-cover/1
true
