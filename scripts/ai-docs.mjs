// Writes the table of AI tasks in docs/AI.md from src/11d_ai_tasks.js (between the "tasks" markers).
//   node scripts/ai-docs.mjs          update docs/AI.md
//   node scripts/ai-docs.mjs --check  exit 1 if docs/AI.md is out of date (used by test 20)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'src/11d_ai_tasks.js'), 'utf8').replace('const AI_TASKS =', 'this.AI_TASKS ='), ctx);
const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/</g, '&lt;');
const rows = Object.entries(ctx.AI_TASKS).map(([id, t]) =>
  '| `' + id + '` | ' + cell(t.feature) + ' | ' + cell(t.does) + ' | ' + (t.json ? 'JSON: `' + String(t.output).replace(/\|/g, '\\|') + '`' : cell(t.output)) +
  ' | ' + t.tier + ' | ' + t.images + ' | `' + cell(t.code) + '` |');
const table = '| Task id | Where in the app | What the model must do | Answer | Model | Pictures | Code |\n|---|---|---|---|---|---|---|\n' + rows.join('\n');

const docPath = join(root, 'docs/AI.md');
const doc = readFileSync(docPath, 'utf8');
const re = /(<!-- tasks:start[^>]*-->)[\s\S]*?(<!-- tasks:end -->)/;
if (!re.test(doc)) { console.error('docs/AI.md has no tasks markers'); process.exit(1); }
const next = doc.replace(re, (_, a, b) => a + '\n' + table + '\n' + b);
if (process.argv.includes('--check')) {
  if (next !== doc) { console.error('docs/AI.md is out of date: run "node scripts/ai-docs.mjs"'); process.exit(1); }
  console.log('docs/AI.md is up to date (' + rows.length + ' tasks)');
} else {
  writeFileSync(docPath, next);
  console.log('wrote ' + rows.length + ' tasks into docs/AI.md');
}
