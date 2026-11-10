// Builds inkling.html from src/ (same as build.sh, but also works on Windows).
//   node scripts/build.mjs            -> inkling.html (the Claude artifact / browser version)
//   node scripts/build.mjs --desktop  -> also dist/index.html + dist/lib/* for the desktop app
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const order = readFileSync(join(src, 'ORDER.txt'), 'utf8').split(/\s+/).filter(Boolean);
const html = order.map((f) => readFileSync(join(src, f), 'utf8')).join('');
writeFileSync(join(root, 'inkling.html'), html);
console.log('built inkling.html');

if (process.argv.includes('--desktop')) {
  // the add-on libraries, copied from node_modules so the app works without internet.
  // The names must match LOCAL_LIBS in src/11b_platform.js.
  const libs = {
    'three.min.js': 'three/build/three.min.js',
    'pdf.min.js': 'pdfjs-dist/build/pdf.min.js',
    'pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js',
    'mammoth.browser.min.js': 'mammoth/mammoth.browser.min.js',
    'xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js',
    'qrcode.js': 'qrcode-generator/qrcode.js',
  };
  const dist = join(root, 'dist');
  mkdirSync(join(dist, 'lib'), { recursive: true });
  writeFileSync(join(dist, 'index.html'), html);
  for (const [name, from] of Object.entries(libs)) {
    const p = join(root, 'node_modules', from);
    if (!existsSync(p)) { console.error('missing ' + from + ': run "npm install" first'); process.exit(1); }
    copyFileSync(p, join(dist, 'lib', name));
  }
  console.log('prepared dist/ for the desktop app');
}
