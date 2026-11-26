#!/usr/bin/env node
// Footage lives in a GitHub Release per film, not in git (an 18-minute film is ~1 GB of clips).
//   node scripts/assets.mjs push films/<name>   upload new or changed files (assets/ and vo/ pieces)
//   node scripts/assets.mjs pull films/<name>   download everything the film needs
// Needs the GitHub CLI (gh) logged in. On GitHub Actions it uses the workflow token.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {filmDir, loadFilm} from './lib.mjs';

const cmd = process.argv[2];
const dir = filmDir(process.argv[3]);
const film = loadFilm(dir);
const tag = `assets-${film.id}`;
const gh = (args, opts = {}) => execFileSync('gh', args, {encoding: 'utf8', maxBuffer: 1 << 28, ...opts});

// the files a film owns, as release asset names: assets__b03-0.mp4, vo__b03.flac
function local() {
  const out = [];
  for (const sub of ['assets', 'vo']) {
    const d = path.join(dir, sub);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (sub === 'vo' && !/^b\d+\.(flac|wav)$/.test(f)) continue; // your voice.* file stays in git
      const p = path.join(d, f);
      if (fs.statSync(p).isFile()) out.push({name: `${sub}__${f}`, file: p, size: fs.statSync(p).size});
    }
  }
  return out;
}

function ensureRelease() {
  const r = spawnSync('gh', ['release', 'view', tag], {encoding: 'utf8'});
  if (r.status !== 0) gh(['release', 'create', tag, '--title', `Footage: ${film.title}`, '--notes', 'Archive assets for the render. Managed by scripts/assets.mjs.', '--prerelease']);
}

function remote() {
  const r = spawnSync('gh', ['release', 'view', tag, '--json', 'assets'], {encoding: 'utf8'});
  if (r.status !== 0) return new Map();
  return new Map(JSON.parse(r.stdout).assets.map((a) => [a.name, a.size]));
}

if (cmd === 'push') {
  ensureRelease();
  const have = remote();
  const todo = local().filter((f) => have.get(f.name) !== f.size);
  if (!todo.length) { console.log(`assets: ${tag} is up to date`); process.exit(0); }
  const staging = fs.mkdtempSync(path.join(dir, '.up-'));
  try {
    for (let i = 0; i < todo.length; i += 20) {
      const batch = todo.slice(i, i + 20).map((f) => { const p = path.join(staging, f.name); fs.copyFileSync(f.file, p); return p; });
      gh(['release', 'upload', tag, '--clobber', ...batch], {stdio: 'inherit'});
      batch.forEach((p) => fs.unlinkSync(p));
      console.log(`assets: uploaded ${Math.min(i + 20, todo.length)}/${todo.length}`);
    }
  } finally { fs.rmSync(staging, {recursive: true, force: true}); }
} else if (cmd === 'pull') {
  const have = remote();
  if (!have.size) { console.log(`assets: no release ${tag} yet`); process.exit(0); }
  const mine = new Map(local().map((f) => [f.name, f.size]));
  const want = [...have.entries()].filter(([n, s]) => mine.get(n) !== s).map(([n]) => n);
  if (!want.length) { console.log('assets: all present'); process.exit(0); }
  const tmp = fs.mkdtempSync(path.join(dir, '.down-'));
  try {
    for (let i = 0; i < want.length; i += 50) gh(['release', 'download', tag, '-D', tmp, '--clobber', ...want.slice(i, i + 50).flatMap((n) => ['-p', n])], {stdio: 'inherit'});
    for (const n of fs.readdirSync(tmp)) {
      const [sub, f] = n.split('__');
      if (!f) continue;
      fs.mkdirSync(path.join(dir, sub), {recursive: true});
      fs.renameSync(path.join(tmp, n), path.join(dir, sub, f));
    }
  } finally { fs.rmSync(tmp, {recursive: true, force: true}); }
  console.log(`assets: downloaded ${want.length} file(s)`);
} else {
  console.error('usage: node scripts/assets.mjs push|pull films/<name>');
  process.exit(2);
}
