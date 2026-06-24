#!/usr/bin/env node
// Pre-compress static assets to .br (brotli) and .gz (gzip) at build time so the
// server can serve them with zero per-request CPU. Run after webpack:
//   webpack --config webpack.config.cjs && node scripts/compress-dist.cjs
// CleanWebpackPlugin wipes dist each build, so stale variants never accumulate.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Text-ish assets worth compressing. Skip already-compressed binaries
// (png/jpg/webp/woff/woff2/gz/br/ico) — recompressing them wastes space/time.
const COMPRESSIBLE = new Set([
  '.js', '.css', '.svg', '.json', '.html', '.htm', '.txt', '.xml',
  '.map', '.webmanifest', '.wasm', '.eot', '.ttf', '.otf',
]);
const MIN_BYTES = 1024; // don't bother with tiny files

const roots = process.argv.slice(2);
if (roots.length === 0) roots.push('dist', 'public');

const BR_OPTS = {
  params: {
    [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
    [zlib.constants.BROTLI_PARAM_SIZE_HINT]: 0,
  },
};

let count = 0, savedBr = 0, savedGz = 0;

function walk(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!COMPRESSIBLE.has(ext)) continue;
    if (e.name.endsWith('.br') || e.name.endsWith('.gz')) continue;
    const buf = fs.readFileSync(full);
    if (buf.length < MIN_BYTES) continue;

    const br = zlib.brotliCompressSync(buf, BR_OPTS);
    if (br.length < buf.length) { fs.writeFileSync(full + '.br', br); savedBr += buf.length - br.length; }
    const gz = zlib.gzipSync(buf, { level: 9 });
    if (gz.length < buf.length) { fs.writeFileSync(full + '.gz', gz); savedGz += buf.length - gz.length; }
    count++;
  }
}

const start = Date.now();
for (const r of roots) walk(path.resolve(process.cwd(), r));
const kb = n => (n / 1024).toFixed(0);
console.log(`compress-dist: ${count} files in ${roots.join(', ')} -> ` +
  `brotli saved ${kb(savedBr)}KB, gzip saved ${kb(savedGz)}KB (${Date.now() - start}ms)`);
