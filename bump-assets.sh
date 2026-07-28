#!/bin/bash
# Stamp asset URLs with the current commit hash so Cloudflare cannot serve
# stale CSS or JS after a deploy. Run before committing an asset change.
set -e
V=$(git rev-parse --short HEAD)
python3 - "$V" <<'PY'
import sys, re
v = sys.argv[1]
for p in ("index.html", "secret.html"):
    s = open(p, encoding="utf-8", newline='').read()
    s = re.sub(r'(href="/assets/css/style\.css)(\?v=[^"]*)?"', r'\1?v=' + v + '"', s)
    s = re.sub(r'(src="/assets/js/([a-z]+)\.js)(\?v=[^"]*)?"', r'\1?v=' + v + '"', s)
    open(p, "w", encoding="utf-8", newline='').write(s)
    print("stamped", p, "->", v)
PY
