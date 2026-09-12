#!/usr/bin/env python3
"""Insert no-cache location for /sw.js into nginx site configs."""
from pathlib import Path

SNIPPET = """
    # Service Worker нельзя кэшировать как immutable — иначе телефоны залипают.
    location = /sw.js {
        add_header Cache-Control "no-cache, must-revalidate" always;
        try_files $uri =404;
    }
"""

PATHS = [
    Path("/etc/nginx/sites-enabled/delores-object-ip"),
    Path("/etc/nginx/sites-enabled/delores-object"),
    Path("/etc/nginx/sites-available/delores-object-ip"),
    Path("/etc/nginx/sites-available/delores-object"),
]

for p in PATHS:
    if not p.exists():
        print("skip", p)
        continue
    t = p.read_text()
    if "location = /sw.js" in t:
        print("already", p)
        continue
    marker = 'location = /index.html {'
    idx = t.find(marker)
    if idx < 0:
        print("no index.html location", p)
        continue
    # find end of that location block
    end = t.find("\n    }\n", idx)
    if end < 0:
        print("no block end", p)
        continue
    insert_at = end + len("\n    }\n")
    t = t[:insert_at] + SNIPPET + t[insert_at:]
    p.write_text(t)
    print("patched", p)
