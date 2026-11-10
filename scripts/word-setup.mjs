// Cortex Scribe Word link: one-time setup (npm run word:setup), and removal (npm run word:remove).
// 1. A safe certificate for https://localhost, which Word needs to load add-ins. Made by Microsoft's own tool
//    (office-addin-dev-certs); Windows asks once whether to trust it.
// 2. The Cortex Scribe button in Word: on Windows the add-in's manifest is registered for this user (the way
//    Microsoft's developer tools do it); on a Mac it is copied into Word's add-in folder. Word on the web:
//    Insert → Add-ins → Upload My Add-in → word-addin/manifest.xml.
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { homedir, platform } from 'node:os';
import { mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = join(root, 'word-addin', 'manifest.xml');
const ID = 'f8b0aeb2-85d3-49a7-abb3-4326d9bd057d';
const KEY = 'HKCU\\Software\\Microsoft\\Office\\16.0\\WEF\\Developer';
const macDir = join(homedir(), 'Library', 'Containers', 'com.microsoft.Word', 'Data', 'Documents', 'wef');
const remove = process.argv.includes('--remove');
// on Windows, npx and reg need a shell; pass one command line (the paths are quoted) so Node doesn't warn
const q = (a) => (/[\s"&|<>^]/.test(a) ? '"' + String(a).replace(/"/g, '""') + '"' : a);
const run = (cmd, args) => (platform() === 'win32' ? spawnSync([cmd, ...args].map(q).join(' '), { stdio: 'inherit', shell: true }) : spawnSync(cmd, args, { stdio: 'inherit' }));

if (remove) {
  if (platform() === 'win32') run('reg', ['delete', KEY, '/v', ID, '/f']);
  else if (platform() === 'darwin') rmSync(join(macDir, 'cortex-scribe-manifest.xml'), { force: true });
  console.log('\nThe Cortex Scribe button is removed from Word (restart Word). The certificate stays; remove it with:\n    npx office-addin-dev-certs uninstall\n');
  process.exit(0);
}

console.log('\nStep 1 of 2: a safe certificate for https://localhost (Windows may ask you to confirm once).\n');
const c = run('npx', ['--yes', 'office-addin-dev-certs', 'install']);
if (c.status !== 0) console.log('\nThe certificate step didn’t finish. You can run it yourself:  npx office-addin-dev-certs install\n');

console.log('\nStep 2 of 2: the Cortex Scribe button in Word.\n');
if (platform() === 'win32') {
  const r = run('reg', ['add', KEY, '/v', ID, '/t', 'REG_SZ', '/d', manifest, '/f']);
  console.log(r.status === 0 ? 'Done. Close Word completely and open it again: the Home tab now has a Cortex Scribe button.' : 'Couldn’t add the button. Another way: in Word on the web, Insert → Add-ins → Upload My Add-in → ' + manifest);
} else if (platform() === 'darwin') {
  mkdirSync(macDir, { recursive: true });
  copyFileSync(manifest, join(macDir, 'cortex-scribe-manifest.xml'));
  console.log('Done. Close Word completely and open it again: Insert → Add-ins → My Add-ins shows Cortex Scribe.');
} else {
  console.log('Word for the desktop isn’t available here. Use Word on the web: Insert → Add-ins → Upload My Add-in → ' + manifest);
}
console.log('\nFrom now on, start the link with:  npm run word\n' + (existsSync(join(homedir(), '.office-addin-dev-certs', 'localhost.crt')) ? '' : '(The certificate isn’t there yet: run step 1 again.)\n'));
