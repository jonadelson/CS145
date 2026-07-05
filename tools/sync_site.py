#!/usr/bin/env python3
"""Mirror cs145.web.app into a local directory (BFS over same-site links).

Usage:  python3 tools/sync_site.py <mirror-dir>
Then rebuild the app content:  python3 tools/build_content.py <mirror-dir> .

Skips nothing by content type, but the app build only embeds non-video assets;
videos always stream from the live site.
"""
import collections
import os
import re
import ssl
import sys
import urllib.parse
import urllib.request

BASE = "https://cs145.web.app/"

SEEDS = [
    "", "progress.html", "study/study.html", "psets/psets.html", "projects/projects.html",
    "Module0-Kickoff/why-memory-matters.html",
    "Module1-SQL/learning-outcomes.html",
    "Module2-Systems/section2-intro.html",
    "Module3-nanoDB/storage-layout.html",
    "Module4-Transactions/motivation.html",
    "Module5-Distributed/sharding-replication.html",
    "Module6-Data-Systems/section1a-intro.html",
    "shared/quiz-data/psets/pset-m1.answers.js",
    "shared/quiz-data/psets/pset-m2.answers.js",
    "shared/quiz-data/psets/pset-m3.answers.js",
    "shared/quiz-data/psets/pset-m4.answers.js",
]

HREF_RE = re.compile(r'''(?:href|src|poster)\s*=\s*["']([^"'#]+)["']''', re.I)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    out = os.path.abspath(sys.argv[1])

    ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None) \
        if os.environ.get("SSL_CERT_FILE") else ssl.create_default_context()
    handlers = [urllib.request.HTTPSHandler(context=ctx)]
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        handlers.append(urllib.request.ProxyHandler({"https": proxy, "http": proxy}))
    opener = urllib.request.build_opener(*handlers)

    queue = collections.deque(urllib.parse.urljoin(BASE, s) for s in SEEDS)
    seen = set(q.split("?")[0] for q in queue)
    n_saved, errors = 0, []

    def local_path(url):
        p = urllib.parse.urlparse(url).path
        if p.endswith("/") or p == "":
            p += "index.html"
        return os.path.join(out, p.lstrip("/"))

    while queue:
        url = queue.popleft()
        clean = url.split("?")[0]
        if not clean.startswith(BASE.rstrip("/")):
            continue
        try:
            with opener.open(url, timeout=60) as r:
                data = r.read()
                ctype = r.headers.get("Content-Type", "")
        except Exception as e:  # retry once, then record
            try:
                with opener.open(url, timeout=60) as r:
                    data = r.read()
                    ctype = r.headers.get("Content-Type", "")
            except Exception as e2:
                errors.append((url, str(e2)))
                continue
        path = local_path(clean)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(data)
        n_saved += 1
        if "html" in ctype or clean.endswith(".html"):
            text = data.decode("utf-8", "replace")
            for link in HREF_RE.findall(text):
                if link.startswith(("mailto:", "javascript:", "data:", "${")):
                    continue
                absu = urllib.parse.urljoin(clean, link).split("#")[0]
                key = absu.split("?")[0]
                if key.startswith(BASE.rstrip("/")) and key not in seen:
                    seen.add(key)
                    queue.append(absu)

    print(f"saved {n_saved} files -> {out} ({len(errors)} errors)")
    for u, e in errors:
        print("  ERR", u, e)


if __name__ == "__main__":
    main()
