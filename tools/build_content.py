#!/usr/bin/env python3
"""Build the app's embedded content from a mirror of cs145.web.app.

Reads a local mirror of the course site (see tools/sync_site.py), extracts the
article body of every lecture page, rewrites asset paths, and emits:

  content/manifest.json           course map: areas -> modules -> sections -> pages
  content/pages/<Module>/<page>.html   article fragments (reader content)
  content/vtt/<Module>/<page>.vtt      video transcripts
  content/search-index.json       client-side full-text search index
  content/psets.json              problem-set banks (questions + answers)
  assets/<Module>/...             svgs / images referenced by the articles

Usage:  python3 tools/build_content.py <mirror-dir> [repo-root]
"""
import html as htmllib
import json
import os
import re
import shutil
import sys

SITE = "https://cs145.web.app"

AREA_PAGES = [
    ("kickoff",      "Kickoff",       "#334155", "Module0-Kickoff/course-logistics.html"),
    ("sql",          "SQL",           "#3b82f6", "Module1-SQL/learning-outcomes.html"),
    ("systems",      "Systems",       "#f59e0b", "Module2-Systems/section2-intro.html"),
    ("nanodb",       "nanoDB",        "#10b981", "Module3-nanoDB/storage-layout.html"),
    ("transactions", "Transactions",  "#8b5cf6", "Module4-Transactions/motivation.html"),
    ("distributed",  "Distributed",   "#ec4899", "Module5-Distributed/sharding-replication.html"),
    ("datasystems",  "Data Systems",  "#64748b", "Module6-Data-Systems/section1a-intro.html"),
]

PSETS = ["m1", "m2", "m3", "m4"]


# ---------------------------------------------------------------- TOC parsing
from html.parser import HTMLParser


class SidebarParser(HTMLParser):
    """Pulls the module/section/page tree out of a page's sidebar nav."""

    def __init__(self):
        super().__init__()
        self.in_sidebar = False
        self.depth = 0
        self.mods = []
        self.cur_mod = None
        self.cur_sub = None
        self.cur_link = None
        self.text_target = None
        self.buf = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get("class", "")
        toks = cls.split()
        if tag == "nav" and "sidebar" in toks:
            self.in_sidebar = True
            self.depth = 0
            return
        if not self.in_sidebar:
            return
        self.depth += 1
        if "nav-mod-title" in toks:
            self.text_target = "modtitle"
            self.buf = ""
        elif tag == "div" and "nav-mod" in toks:
            self.cur_mod = {"dir": a.get("data-mod", ""), "title": "", "sections": []}
            self.mods.append(self.cur_mod)
        elif tag == "div" and "nav-subsection" in toks:
            self.cur_sub = {"title": "", "pages": []}
            if self.cur_mod is not None:
                self.cur_mod["sections"].append(self.cur_sub)
        elif tag == "h4" and self.cur_sub is not None:
            self.text_target = "subhead"
            self.buf = ""
        elif tag == "a" and "nav-link" in toks and self.cur_sub is not None:
            kind = "quiz" if "nav-quiz" in toks else "page"
            self.cur_link = {"path": a.get("data-path", ""), "title": "", "kind": kind}
            self.text_target = "link"
            self.buf = ""
        elif tag == "div" and self.cur_link is not None and "case-badge" in toks:
            self.cur_link["kind"] = "case"

    def handle_endtag(self, tag):
        if not self.in_sidebar:
            return
        if self.text_target == "modtitle" and tag == "span":
            self.cur_mod["title"] = self.buf.strip()
            self.text_target = None
        elif self.text_target == "subhead" and tag == "h4":
            self.cur_sub["title"] = self.buf.strip()
            self.text_target = None
        elif self.text_target == "link" and tag == "a":
            self.cur_link["title"] = re.sub(r"\s+", " ", self.buf).strip()
            self.cur_sub["pages"].append(self.cur_link)
            self.cur_link = None
            self.text_target = None
        self.depth -= 1
        if self.depth <= 0 and tag == "nav":
            self.in_sidebar = False

    def handle_data(self, data):
        if self.text_target:
            self.buf += data


# ------------------------------------------------------------- article munge

def page_id(path):
    """Module1-SQL/select-from-where.html -> Module1-SQL/select-from-where"""
    return re.sub(r"\.html$", "", path)


def extract_article(text):
    m = re.search(r'<article class="v5-article">(.*?)</article>\s*', text, re.S)
    return m.group(1) if m else None


def process_article(body, mod_dir, mirror, out_assets):
    """Rewrite asset refs, strip video banner + inline scripts. Returns
    (html, video_meta, copied_assets)."""
    video = None

    # Video banner: capture mp4/vtt/poster, then remove the section.
    vb = re.search(r'<section class="video-banner">.*?</section>', body, re.S)
    if vb:
        seg = vb.group(0)
        mp4 = re.search(r'src="([^"]+\.mp4[^"]*)"', seg)
        vtt = re.search(r'src="([^"]+\.vtt[^"]*)"', seg)
        poster = re.search(r'poster="([^"]+)"', seg)
        video = {}
        if mp4:
            video["mp4"] = f"{SITE}/{mod_dir}/" + mp4.group(1)
        if poster:
            video["poster"] = f"{SITE}/{mod_dir}/" + poster.group(1)
        if vtt:
            video["vtt_rel"] = vtt.group(1).split("?")[0]
        body = body.replace(seg, "")

    # Inline <script> blocks are site chrome (tours etc.) - drop them.
    body = re.sub(r"<script\b[^>]*>.*?</script>", "", body, flags=re.S)

    copied = []

    def rewrite_src(m):
        attr, url = m.group(1), m.group(2)
        clean = url.split("?")[0]
        if clean.startswith(("http://", "https://", "data:", "#")):
            return m.group(0)
        if clean.endswith(".mp4"):
            return f'{attr}="{SITE}/{mod_dir}/{clean}"'
        # local asset -> copy into assets/ and point there
        src_path = os.path.normpath(os.path.join(mirror, mod_dir, clean))
        if os.path.exists(src_path):
            rel = os.path.relpath(src_path, mirror)
            dest = os.path.join(out_assets, rel)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if not os.path.exists(dest):
                shutil.copy2(src_path, dest)
            copied.append(rel)
            return f'{attr}="assets/{rel}"'
        return m.group(0)

    body = re.sub(r'(src|poster)="([^"]+)"', rewrite_src, body)

    # Links to other course pages -> app router links; anything else untouched.
    def rewrite_href(m):
        url = m.group(1)
        clean = url.split("#")[0].split("?")[0]
        if clean.startswith(("http://", "https://", "mailto:", "data:")) or not clean:
            return m.group(0)
        if clean.endswith(".html"):
            target = os.path.normpath(os.path.join(mod_dir, clean))
            return f'href="#/page/{page_id(target)}"'
        if clean.endswith((".pdf", ".sql", ".ics")):
            src_path = os.path.normpath(os.path.join(mirror, mod_dir, clean))
            if os.path.exists(src_path):
                rel = os.path.relpath(src_path, mirror)
                dest = os.path.join(out_assets, rel)
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                if not os.path.exists(dest):
                    shutil.copy2(src_path, dest)
                return f'href="assets/{rel}" target="_blank"'
        return m.group(0)

    body = re.sub(r'href="([^"]+)"', rewrite_href, body)
    return body.strip(), video, copied


def strip_text(body):
    """Plain text of an article for the search index."""
    t = re.sub(r"<(style|script)\b[^>]*>.*?</\1>", " ", body, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = htmllib.unescape(t)
    return re.sub(r"\s+", " ", t).strip()


def headings_of(body):
    hs = re.findall(r"<h([23])[^>]*>(.*?)</h\1>", body, re.S)
    out = []
    for _, h in hs:
        h = re.sub(r"<[^>]+>", "", h)
        out.append(htmllib.unescape(h).strip())
    return out


# ----------------------------------------------------------------------- main

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    mirror = os.path.abspath(sys.argv[1])
    root = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.getcwd()

    out_content = os.path.join(root, "content")
    out_assets = os.path.join(root, "assets")
    os.makedirs(out_content, exist_ok=True)
    os.makedirs(out_assets, exist_ok=True)

    # 1. course map from sidebars
    areas = []
    for aid, aname, accent, probe in AREA_PAGES:
        text = open(os.path.join(mirror, probe), encoding="utf-8", errors="replace").read()
        p = SidebarParser()
        p.feed(text)
        areas.append({"id": aid, "title": aname, "accent": accent, "modules": p.mods})

    # 2. extract every page
    search, missing = [], []
    for area in areas:
        for mod in area["modules"]:
            mod_dir = mod["dir"]
            for sec in mod["sections"]:
                for pg in sec["pages"]:
                    path = pg["path"]
                    pg["id"] = page_id(path)
                    src = os.path.join(mirror, path)
                    if not os.path.exists(src):
                        missing.append(path)
                        pg["missing"] = True
                        continue
                    text = open(src, encoding="utf-8", errors="replace").read()
                    body = extract_article(text)
                    if body is None:
                        missing.append(path + " (no article)")
                        pg["missing"] = True
                        continue
                    body, video, _ = process_article(body, mod_dir, mirror, out_assets)
                    if video:
                        pg["video"] = video.get("mp4")
                        if video.get("poster"):
                            pg["poster"] = video["poster"]
                        vtt_rel = video.get("vtt_rel")
                        if vtt_rel:
                            vsrc = os.path.join(mirror, mod_dir, vtt_rel)
                            if os.path.exists(vsrc):
                                vdst = os.path.join(out_content, "vtt", mod_dir, os.path.basename(vtt_rel))
                                os.makedirs(os.path.dirname(vdst), exist_ok=True)
                                shutil.copy2(vsrc, vdst)
                                pg["vtt"] = f"content/vtt/{mod_dir}/{os.path.basename(vtt_rel)}"
                    frag = os.path.join(out_content, "pages", path)
                    os.makedirs(os.path.dirname(frag), exist_ok=True)
                    with open(frag, "w", encoding="utf-8") as f:
                        f.write(body)
                    txt = strip_text(body)
                    pg["words"] = len(txt.split())
                    search.append({
                        "id": pg["id"],
                        "title": pg["title"],
                        "module": mod["title"],
                        "area": area["id"],
                        "headings": headings_of(body),
                        "text": txt,
                    })

    with open(os.path.join(out_content, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump({"site": SITE, "areas": areas}, f, indent=1)
    with open(os.path.join(out_content, "search-index.json"), "w", encoding="utf-8") as f:
        json.dump(search, f)

    # 3. problem sets (questions + answer keys)
    psets = {}
    for m in PSETS:
        qf = os.path.join(mirror, "shared/quiz-data/psets", f"pset-{m}.js")
        af = os.path.join(mirror, "shared/quiz-data/psets", f"pset-{m}.answers.js")
        if not (os.path.exists(qf) and os.path.exists(af)):
            continue
        qtxt = open(qf, encoding="utf-8").read()
        atxt = open(af, encoding="utf-8").read()
        qjson = qtxt[qtxt.index("["): qtxt.rindex("]") + 1]
        ajson = atxt[atxt.index("{"): atxt.rindex("}") + 1]
        questions = json.loads(qjson)
        answers = json.loads(ajson)
        for q in questions:
            ans = answers.get(q["id"], {})
            q["correct"] = ans.get("correct")
            q["explanation"] = ans.get("explanation", "")
        psets[m] = questions
    with open(os.path.join(out_content, "psets.json"), "w", encoding="utf-8") as f:
        json.dump(psets, f, indent=1)

    n_pages = len(search)
    print(f"pages extracted: {n_pages}")
    print(f"psets: " + ", ".join(f"{k}:{len(v)}" for k, v in psets.items()))
    if missing:
        print("MISSING:")
        for m in missing:
            print("  -", m)


if __name__ == "__main__":
    main()
