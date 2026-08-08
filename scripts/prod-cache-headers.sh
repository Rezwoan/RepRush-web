#!/usr/bin/env bash
#
# P14 · carry P1's document-cache fix across to the PRODUCTION nginx vhost.
#
# Next.js marks prerendered documents `s-maxage=31536000, stale-while-revalidate`,
# which assumes a CDN that gets purged on every deploy. Nothing purges here. With
# no `max-age`, a browser reads that as "serve stale now, revalidate in the
# background" — so every returning visitor is one deploy behind, and right after a
# deploy the stale shell points at /_next chunks that no longer exist (white
# screen until a hard refresh). The dev vhost has had this fix since P1.
#
# Run it BEFORE the v2 merge: the revalidation then happens against v1, whose
# content is unchanged, and stores a `no-cache` document — so the deploy that
# follows is picked up on the first load rather than the second.
#
# Safe to re-run: it detects its own change and exits. Backs the vhost up, and
# validates with `nginx -t` before reloading — a bad config never goes live.
#
#   ssh reezz@blackbox.local 'bash -s' < scripts/prod-cache-headers.sh
#
# To undo, see docs/v2/ROLLBACK.md §3 (and read why you probably should not).

set -euo pipefail
V=/etc/nginx/sites-available/reprush

if sudo grep -q 'proxy_hide_header Cache-Control' "$V"; then
  echo "already applied — nothing to do"
  exit 0
fi

BAK="$V.bak-precutover-$(date +%Y%m%d)"
sudo cp "$V" "$BAK"
echo "backed up to $BAK"

sudo python3 - "$V" <<'PY'
import sys

path = sys.argv[1]
src = open(path).read()

# The tail of the frontend `location /` block. Asserting it appears exactly once
# is what keeps this from editing the /api/ or /_next/static/ blocks by accident.
anchor = "        proxy_cache_bypass $http_upgrade;\n    }"
n = src.count(anchor)
assert n == 1, "expected exactly one frontend location block, found %d" % n

replacement = """        proxy_cache_bypass $http_upgrade;

        # Next.js sends "s-maxage=31536000, stale-while-revalidate" on
        # prerendered documents, which assumes a CDN purged on every deploy.
        # Nothing purges here, so a returning browser serves a year-old HTML
        # shell referencing /_next chunks the deploy already deleted.
        proxy_hide_header Cache-Control;
        add_header Cache-Control "no-cache" always;
    }"""

open(path, "w").write(src.replace(anchor, replacement))
print("inserted cache fix")
PY

echo "--- nginx -t ---"
sudo nginx -t
sudo systemctl reload nginx

echo "--- documents (want: no-cache, and NO X-Robots-Tag — that one is dev-only) ---"
curl -sI http://127.0.0.1/login -H 'Host: reprush.rezwoan.codes' \
  | grep -iE 'HTTP/|cache-control|x-robots' || true

echo "--- static assets (want: immutable, unchanged) ---"
curl -sI http://127.0.0.1/_next/static/chunks/webpack.js -H 'Host: reprush.rezwoan.codes' \
  | grep -iE 'HTTP/|cache-control' || true
