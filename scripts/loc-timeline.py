#!/usr/bin/env python3
"""Compute lines-of-code by category across git history."""
import subprocess, json, sys

def git(args):
    return subprocess.run(["git"] + args, capture_output=True, text=True, errors="replace").stdout

def categorize(path):
    p = path
    # vendored / minified -> skip
    if ".min." in p or p.startswith("public/js/"):
        return None
    # tests -> skip
    if p.startswith("test/") or p.endswith(".test.js") or p.endswith(".spec.js") \
       or p == "playwright.config.js":
        return None
    if p.endswith(".html"):
        return "html"
    if p.endswith(".scss") or p.endswith(".css"):
        return "css"
    if p.endswith(".js"):
        if p == "server.js" or p.startswith("lib/server/"):
            return "server_js"
        if (p.startswith("lib/client/") or p.startswith("lib/components/")
                or p.startswith("lib/shared/") or p == "lib/index.js"):
            return "client_js"
        return None  # build configs, misc root js
    return None

# commits oldest -> newest
log = git(["log", "--reverse", "--format=%H\t%cI"]).strip().splitlines()

rows = []
for line in log:
    sha, date = line.split("\t")
    tree = git(["ls-tree", "-r", "--format=%(objectname) %(path)", sha]).splitlines()
    # collect blob hash per matched file
    wanted = {}  # hash -> category  (dedup identical blobs across paths is fine to sum separately)
    matched = []  # (hash, category)
    for entry in tree:
        if not entry.strip():
            continue
        h, path = entry.split(" ", 1)
        cat = categorize(path)
        if cat:
            matched.append((h, cat))

    counts = {"client_js": 0, "server_js": 0, "html": 0, "css": 0}
    if matched:
        # batch fetch line counts
        req = "\n".join(h for h, _ in matched) + "\n"
        proc = subprocess.run(["git", "cat-file", "--batch"],
                              input=req.encode(), capture_output=True)
        out = proc.stdout
        idx = 0
        i = 0
        while idx < len(out) and i < len(matched):
            # header line: <sha> blob <size>\n
            nl = out.index(b"\n", idx)
            header = out[idx:nl].decode()
            parts = header.split()
            size = int(parts[2])
            content_start = nl + 1
            content = out[content_start:content_start + size]
            lines = content.count(b"\n")
            if size > 0 and not content.endswith(b"\n"):
                lines += 1
            counts[matched[i][1]] += lines
            idx = content_start + size + 1  # skip trailing newline after blob
            i += 1

    rows.append({"sha": sha[:9], "date": date[:10], "datetime": date, **counts,
                 "total": sum(counts.values())})

print(json.dumps(rows, indent=2))
