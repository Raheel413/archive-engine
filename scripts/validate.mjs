#!/usr/bin/env node
// Checks a film before it renders. Errors stop the render; warnings don't.
// usage: node scripts/validate.mjs films/<name> [--allow-missing]
import fs from 'node:fs';
import path from 'node:path';
import {buildTimeline, MAX_CLIP, MAX_STRETCH} from '../src/timeline.mjs';
import {filmDir, flag, loadFilm} from './lib.mjs';

const dir = filmDir(process.argv[2]);
const film = loadFilm(dir);
const allowMissing = flag('--allow-missing');
const errors = [];
const warns = [];
const KINDS = ['clip', 'photo', 'print', 'page', 'poster', 'soundbite'];

if (!film.star?.name) errors.push('film.star.name is missing');
if (!film.beats?.length) errors.push('no beats');

const sources = new Map();
film.beats.forEach((b, bi) => {
  const id = `beat ${bi}`;
  if (!['hook', 'line', 'outro', 'chapter', 'soundbite', 'quote'].includes(b.seg)) errors.push(`${id}: unknown seg "${b.seg}"`);
  if (b.seg === 'chapter' && !b.title) errors.push(`${id}: chapter needs a title`);
  if (['hook', 'line', 'outro'].includes(b.seg)) {
    if (!b.text) errors.push(`${id}: a line needs text`);
    if (!b.shots?.length) errors.push(`${id}: no shots ("${(b.text ?? '').slice(0, 40)}...")`);
    if (!b.vo) warns.push(`${id}: no voiceover yet (run align)`);
  }
  if (b.seg === 'soundbite') {
    const s = b.shots?.[0];
    if (!s || s.kind !== 'soundbite') errors.push(`${id}: a soundbite beat needs one shot of kind "soundbite"`);
    else if (!s.find && !s.url) errors.push(`${id}: soundbite needs "find" (the words) or a "url" + "t"`);
  }
  (b.shots ?? []).forEach((s, si) => {
    const sid = `b${String(bi).padStart(2, '0')}-${si}`;
    if (!KINDS.includes(s.kind)) errors.push(`${sid}: unknown kind "${s.kind}"`);
    if (s.kind === 'soundbite' && b.seg !== 'soundbite') errors.push(`${sid}: soundbite shots only go in soundbite beats`);
    if (s.kind === 'page' && !s.url) errors.push(`${sid}: a page needs a url`);
    if (!s.src) {
      (allowMissing ? warns : errors).push(`${sid}: no asset yet (${s.kind}: ${s.q ?? s.film ?? s.find ?? s.url ?? ''})`);
      return;
    }
    if (!fs.existsSync(path.join(dir, s.src))) errors.push(`${sid}: file missing ${s.src}`);
    if ((s.kind === 'clip' || s.kind === 'soundbite') && (s.dur ?? 0) > MAX_CLIP + 0.05) errors.push(`${sid}: ${s.dur}s is over the ${MAX_CLIP}s limit`);
    if (!s.credit) errors.push(`${sid}: no credit`);
    if (s.unchecked) warns.push(`${sid}: the vision check was unavailable when this was found, look at it (redo with --redo ${sid})`);
    if (!s.source && s.kind !== 'page') warns.push(`${sid}: no source link for the credits`);
    if (s.kind === 'soundbite' && !s.audio) errors.push(`${sid}: soundbite has no audio file`);
    if (s.source && s.kind !== 'soundbite') {
      if (sources.has(s.source)) warns.push(`${sid}: same source as ${sources.get(s.source)} (${s.source})`);
      else sources.set(s.source, sid);
    }
  });
});

// timing rules on the built timeline
const tl = buildTimeline(film);
for (const it of tl.items) {
  if (it.type !== 'shot' || !it.shot.src) continue;
  const sid = `b${String(it.bi).padStart(2, '0')}`;
  if (it.shot.kind === 'clip' && it.dur > (it.shot.dur ?? MAX_CLIP) * MAX_STRETCH + 0.05)
    warns.push(`${sid}: a ${(it.shot.dur ?? 0).toFixed(1)}s clip has to cover ${it.dur.toFixed(1)}s, it will freeze at the end. Add a second shot to this line.`);
  if (it.dur > 7.5) warns.push(`${sid}: one visual holds ${it.dur.toFixed(1)}s. Split the line into two shots (Dodford pace is 2-5 s).`);
}
const shots = tl.items.filter((i) => i.type === 'shot');
const avg = shots.reduce((s, i) => s + i.dur, 0) / Math.max(1, shots.length);
const kinds = {};
film.beats.forEach((b) => (b.shots ?? []).forEach((s) => (kinds[s.kind] = (kinds[s.kind] ?? 0) + 1)));

console.log(`${film.title}: ${(tl.total / 60).toFixed(1)} min, ${shots.length} visuals, avg ${avg.toFixed(1)} s each, ${Object.entries(kinds).map(([k, v]) => `${v} ${k}`).join(', ')}`);
if (tl.total > 60 * 22) warns.push(`runs ${(tl.total / 60).toFixed(1)} min (target 15-20)`);
for (const w of warns) console.log('  warn:', w);
for (const e of errors) console.log('  ERROR:', e);
console.log(errors.length ? `${errors.length} error(s)` : 'ok');
process.exit(errors.length ? 1 : 0);
