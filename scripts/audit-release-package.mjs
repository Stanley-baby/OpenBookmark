import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputs = [path.join(root, '.output', 'chrome-mv3'), path.join(root, '.output', 'edge-mv3')];
const forbidden = [/api\.raindrop\.io/i, /rdl\.ink/i, /LDGFBFFKINOOELOADEKPMFOKLNOBPIEN/i, /telemetry/i, /analytics/i];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : target;
  }));
  return files.flat();
}

for (const output of outputs) {
  const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
  if (manifest.content_scripts) throw new Error(`${output} contains content scripts`);
  const files = await walk(output);
  for (const file of files.filter((item) => /\.(js|css|html|json|svg|txt)$/.test(item))) {
    const text = await readFile(file, 'utf8');
    const hit = forbidden.find((pattern) => pattern.test(text));
    if (hit) throw new Error(`${file} contains forbidden release marker ${hit}`);
  }
}

console.log('Release package audit passed.');
