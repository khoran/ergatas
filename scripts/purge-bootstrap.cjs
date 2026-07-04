// Purge unused rules from the stock bootstrap.min.css (~160KB raw; the app
// uses a small fraction) for the production build.
//
// public/bootstrap.min.css (the full vendor file) is left untouched; the
// purged copy is written to dist/bootstrap.min.css, which wins because the
// server mounts dist before public (see server.js). Dev builds wipe dist and
// don't run this script, so they fall back to the full file.
//
// Selector usage is gathered from every template and client source file.
// Classes bootstrap's own JS toggles at runtime (modal/collapse/carousel/
// dropdown states) never appear in our source, so they're safelisted by
// pattern below. If a bootstrap class is ever constructed dynamically
// ("col-" + n), add it (or a pattern) to the safelist.

const fs = require('fs');
const path = require('path');
const { PurgeCSS } = require('purgecss');

const ROOT = path.resolve(__dirname, '..');

const safelist = {
    standard: [
        'show', 'showing', 'fade', 'active', 'disabled', 'focus', 'hover',
        'modal-open', 'modal-backdrop', 'modal-static', 'collapse', 'collapsing',
        'was-validated', 'is-valid', 'is-invalid',
    ],
    greedy: [
        /^modal/, /^carousel/, /^dropdown/, /^tooltip/, /^bs-tooltip/,
        /^popover/, /^bs-popover/, /^alert/, /^badge/, /^valid-/, /^invalid-/,
        /^close/, /^arrow/,
    ],
};

(async () => {
    const src = path.join(ROOT, 'public/bootstrap.min.css');
    const dest = path.join(ROOT, 'dist/bootstrap.min.css');
    const results = await new PurgeCSS().purge({
        content: [
            path.join(ROOT, 'lib/page-templates/**/*.html'),
            path.join(ROOT, 'lib/snippet-templates/**/*.html'),
            path.join(ROOT, 'lib/components/**/*.{js,html}'),
            path.join(ROOT, 'lib/client/**/*.js'),
            path.join(ROOT, 'lib/index.js'),
            path.join(ROOT, 'public/**/*.html'),
        ],
        css: [src],
        safelist,
        // keep :hover/:focus/::placeholder etc. variants of kept selectors
        variables: true,
    });
    const out = results[0].css;
    fs.writeFileSync(dest, out);
    const before = fs.statSync(src).size;
    console.log(`purge-bootstrap: ${(before/1024).toFixed(0)}KB -> ${(out.length/1024).toFixed(1)}KB`);
})().catch((err) => { console.error(err); process.exit(1); });
