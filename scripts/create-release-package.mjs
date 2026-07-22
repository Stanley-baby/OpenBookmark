import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
const chromeOutput = path.join(root, '.output', 'chrome-mv3');
const edgeOutput = path.join(root, '.output', 'edge-mv3');

async function zipDirectory(source, target) {
  await rm(target, { force: true });
  const result = spawnSync('zip', ['-qr', target, '.'], { cwd: source, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`zip failed for ${source}`);
}

async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

await mkdir(dist, { recursive: true });
const chromeZip = path.join(dist, 'openbookmark-chrome-mv3.zip');
const edgeZip = path.join(dist, 'openbookmark-edge-mv3.zip');
await zipDirectory(chromeOutput, chromeZip);
await zipDirectory(edgeOutput, edgeZip);
await writeFile(path.join(dist, 'SHA256SUMS.txt'), [
  `${await sha256(chromeZip)}  ${path.basename(chromeZip)}`,
  `${await sha256(edgeZip)}  ${path.basename(edgeZip)}`,
  '',
].join('\n'));
