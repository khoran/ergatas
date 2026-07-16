#!/usr/bin/env python3
"""Compute lines-of-code by category across git history.

Scoped to the Node.js/Express era of the repo (commit 4c52fb0, 2020-06-06,
"re-created server side based on express server in nodejs"). Before that the
app was a Scala/Lift project for ~2 weeks; a completely different stack, so
it's out of scope for a client-js/server-js/html/css breakdown.

lib/ was reorganized into lib/client, lib/server, lib/shared, lib/components
starting mid-2021; before that, files lived flat under lib/*.js. The FLAT_*
sets below map each flat-era filename to the category its eventual home
(as of HEAD) belongs to, so the categorization is consistent across the
reorg rather than jumping when files moved.
"""
import subprocess, json, sys

CUTOVER = "4c52fb0"  # first commit of the Node.js rewrite

def git(args):
    return subprocess.run(["git"] + args, capture_output=True, text=True, errors="replace").stdout

# lib/*.js filenames from the pre-reorg era (2020-06 to 2021-06), mapped by
# where each one lives today (traced via basename search on HEAD).
FLAT_SERVER = {
    "lib/app-error.js", "lib/app-state.js", "lib/cachedList.js",
    "lib/cloud-storage.js", "lib/email.js", "lib/mailing-list.js", "lib/utils.js",
}
FLAT_CLIENT = {
    "lib/clamp.js", "lib/client-utils.js", "lib/datatables.js", "lib/editor-chunk.js",
    "lib/filter.js", "lib/impact-map-chunk.js", "lib/ko-common.js", "lib/main.js",
    "lib/map.js", "lib/map-chunk.js", "lib/sanitize.js", "lib/search.js",
    "lib/selectize-chunk.js", "lib/server-api.js", "lib/service-worker.js",
    "lib/upload.js", "lib/data-access.js", "lib/logging.js", "lib/shared-utils.js",
}

def categorize(path):
    p = path
    # vendored / minified -> skip
    if ".min." in p:
        return None
    # public/ is entirely vendored third-party libs and static assets across
    # the whole history (DataTables, bs3-xeditable, jquery, fonts, images...),
    # except a brief 2020-07 to 2020-08 window when the app's real stylesheet
    # lived at public/scss/ before moving to lib/scss/.
    if p.startswith("public/"):
        if p.startswith("public/scss/") and p.endswith(".scss"):
            return "css"
        return None
    # short-lived generated/intermediate CSS output, not hand-authored source
    if p.startswith("lib/css/"):
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
        if p in FLAT_SERVER:
            return "server_js"
        if p in FLAT_CLIENT:
            return "client_js"
        return None  # build configs, misc root js
    return None

# commits oldest -> newest, scoped to the Node.js era
log = git(["log", "--reverse", "--format=%H\t%cI", f"{CUTOVER}^..HEAD"]).strip().splitlines()

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
