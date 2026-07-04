// Subset the Font Awesome webfonts to just the icons the app uses.
//
// The stock fa-solid-900.woff2 is ~150KB and sits on the first-load critical
// path of every page; the app uses ~55 icons (~10KB). Runs after webpack
// (CopyWebpackPlugin has copied the full fonts into dist/webfonts) and before
// compress-dist, overwriting the copies in place. Filenames don't change, so
// dist/webfonts must NOT be served with an immutable/year-long cache header:
// a client that cached last month's subset would never see icons added since
// (see setCustomCacheControl in lib/server/utils.js — webfonts get 7 days).
//
// Icon usage is found by scanning lib/ for fa-* classes and matching them
// against FA's metadata (including v5 alias names like fa-praying-hands).
// Unknown fa-* tokens (sizing utilities like fa-2x, fa-fw) are ignored.
// If an icon class is ever built dynamically ("fa-" + variable), add the
// resulting names to EXTRA_ICONS below.

const fs = require('fs');
const path = require('path');
const subsetFont = require('subset-font');

const ROOT = path.resolve(__dirname, '..');
const FA_DIR = path.join(ROOT, 'node_modules/@fortawesome/fontawesome-free');
// Staged for CopyWebpackPlugin (see webpack.config.cjs), which copies these
// into dist/webfonts during the webpack build. Subsetting must happen BEFORE
// webpack so the service-worker precache manifest hashes the real (subset)
// bytes — hashing the full font and swapping the file afterwards would leave
// installed service workers holding a stale font when the subset changes.
const OUT_DIR = path.join(ROOT, 'build/webfonts-subset');

const EXTRA_ICONS = [
    'spinner', 'circle-notch', // just-in-case spinners
];

function usedIconNames(){
    const names = new Set(EXTRA_ICONS);
    const exts = new Set(['.html', '.js']);
    const walk = (dir) => {
        for(const entry of fs.readdirSync(dir, {withFileTypes: true})){
            const p = path.join(dir, entry.name);
            if(entry.isDirectory()) walk(p);
            else if(exts.has(path.extname(entry.name))){
                const text = fs.readFileSync(p, 'utf8');
                for(const m of text.matchAll(/\bfa-([a-z0-9-]+)/g))
                    names.add(m[1]);
            }
        }
    };
    walk(path.join(ROOT, 'lib'));
    return names;
}

function codepointsFor(names){
    const meta = require(path.join(FA_DIR, 'metadata/icon-families.json'));
    const byName = {};
    for(const [name, info] of Object.entries(meta)){
        byName[name] = info;
        for(const alias of (info.aliases && info.aliases.names) || [])
            byName[alias] = info;
    }
    const codepoints = new Set();
    let count = 0;
    for(const name of names){
        const info = byName[name];
        if(info){
            codepoints.add(parseInt(info.unicode, 16));
            count++;
        }
    }
    return {codepoints, count};
}

async function subsetOne(file, codepoints){
    const src = path.join(FA_DIR, 'webfonts', file);
    const dest = path.join(OUT_DIR, file);
    const original = fs.readFileSync(src);
    const text = [...codepoints].map((c) => String.fromCodePoint(c)).join('');
    const subset = await subsetFont(original, text, {targetFormat: 'woff2'});
    fs.writeFileSync(dest, subset);
    return {file, before: original.length, after: subset.length};
}

(async () => {
    fs.mkdirSync(OUT_DIR, {recursive: true});
    const names = usedIconNames();
    const {codepoints, count} = codepointsFor(names);
    if(count < 10)
        throw new Error(`subset-fa: only matched ${count} icons — scan looks broken, refusing to emit a near-empty font`);
    const results = await Promise.all([
        subsetOne('fa-solid-900.woff2', codepoints),
        subsetOne('fa-regular-400.woff2', codepoints),
    ]);
    for(const r of results)
        console.log(`subset-fa: ${r.file} ${(r.before/1024).toFixed(0)}KB -> ${(r.after/1024).toFixed(1)}KB (${count} icons)`);
})().catch((err) => { console.error(err); process.exit(1); });
