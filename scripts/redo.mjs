#!/usr/bin/env node
// Throws away shots so the next run hunts new ones (and never picks the same source again).
// Works without a laptop: run it, commit film.json, push, and GitHub re-hunts.
// usage: node scripts/redo.mjs films/<name> b05-0,b07-1 ["new search query for all of them"]
import {filmDir, loadFilm, saveFilm} from './lib.mjs';

const dir = filmDir(process.argv[2]);
const ids = (process.argv[3] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const q = process.argv[4];
if (!ids.length) { console.error('usage: node scripts/redo.mjs films/<name> b05-0,b07-1 ["new query"]'); process.exit(2); }
const film = loadFilm(dir);
film.rejected ??= [];
let n = 0;
for (const id of ids) {
  const m = /^b(\d+)-(\d+)$/.exec(id);
  const shot = m && film.beats[+m[1]]?.shots?.[+m[2]];
  if (!shot) { console.warn(`  ${id}: no such shot`); continue; }
  if (shot.source && shot.kind !== 'soundbite') film.rejected.push(shot.source);
  for (const k of ['src', 'audio', 'credit', 'source', 'w', 'h', 'dur', 'focus', 'face', 'highlight', 'src_t', 'unchecked']) delete shot[k];
  if (q) shot.q = q;
  n++;
}
saveFilm(dir, film);
console.log(`redo: ${n} shot(s) cleared. Commit and push film.json and GitHub hunts them again.`);
