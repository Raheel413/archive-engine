#!/usr/bin/env node
// Turns your script into the skeleton of films/<name>/film.json (one beat per sentence).
// Claude then adds the shots to every beat following SKILL.md.
// usage: node scripts/start.mjs films/<name> --star "Steve McQueen" [--title "..."] [--force]
//
// Script format (films/<name>/script.txt), plain text:
//   # 1968 | The King of Cool          a chapter card (year optional)
//   > Steve McQueen: I'd rather wake up in the middle of nowhere than in any city on earth.
//                                      a soundbite: the star's own words, found in real interviews
//   " Quote text here. " -- Steve McQueen, 1972
//                                      a quote card your voice reads
//   anything else                      narration, split into one beat per sentence
// Everything before the first chapter is the hook.
import fs from 'node:fs';
import path from 'node:path';
import {arg, filmDir, flag} from './lib.mjs';

const dir = filmDir(process.argv[2]);
const scriptFile = path.join(dir, 'script.txt');
if (!fs.existsSync(scriptFile)) { console.error(`Put your script in ${scriptFile}`); process.exit(2); }
const out = path.join(dir, 'film.json');
if (fs.existsSync(out) && !flag('--force')) { console.error(`${out} exists. Use --force to rebuild it (shots are lost).`); process.exit(2); }

const star = arg('--star', null);
if (!star) { console.error('Give the star: --star "Steve McQueen"'); process.exit(2); }

// split a paragraph into sentences, keeping "Mr." / "Dr." / "St." / initials together
function sentences(p) {
  const s = p.replace(/\s+/g, ' ').trim();
  const parts = s.match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g) ?? [s];
  const merged = [];
  for (const part of parts.map((x) => x.trim()).filter(Boolean)) {
    const prev = merged[merged.length - 1];
    if (prev && (/\b(Mr|Mrs|Ms|Dr|St|Jr|Sr|vs|No)\.$/.test(prev) || /\b[A-Z]\.$/.test(prev) || prev.split(' ').length < 3)) merged[merged.length - 1] = prev + ' ' + part;
    else merged.push(part);
  }
  return merged;
}

const beats = [];
let inHook = true;
const lines = fs.readFileSync(scriptFile, 'utf8').replace(/\r/g, '').split('\n');
let para = [];
const flush = () => {
  if (!para.length) return;
  for (const text of sentences(para.join(' '))) beats.push({seg: inHook ? 'hook' : 'line', text, shots: []});
  para = [];
};
for (const raw of lines) {
  const l = raw.trim();
  if (!l) { flush(); continue; }
  let m;
  if ((m = /^#\s*(?:(\d{4}s?)\s*\|\s*)?(.+)$/.exec(l))) {
    flush(); inHook = false;
    beats.push({seg: 'chapter', title: m[2].trim(), ...(m[1] ? {year: m[1]} : {})});
  } else if ((m = /^>\s*(?:([^:]{2,40}):\s*)?(.+)$/.exec(l))) {
    flush();
    beats.push({seg: 'soundbite', who: m[1]?.trim() || star, shots: [{kind: 'soundbite', find: m[2].trim(), q: `${m[1]?.trim() || star} interview`}]});
  } else if ((m = /^["“](.+?)["”]\s*(?:--|—|-)\s*(.+)$/.exec(l))) {
    flush();
    beats.push({seg: 'quote', text: m[1].trim(), quote: m[1].trim(), by: m[2].trim()});
  } else para.push(l);
}
flush();
if (beats.length && beats[beats.length - 1].seg === 'line') beats[beats.length - 1].seg = 'outro';

const film = {
  title: arg('--title', path.basename(path.resolve(dir))),
  star: {name: star, era: [1960, 1999]},
  look: {grain: 0.06, vignette: 0.45},
  beats,
};
fs.writeFileSync(out, JSON.stringify(film, null, 2) + '\n');
const spoken = beats.filter((b) => b.text).length;
console.log(`${out}: ${beats.length} beats (${spoken} spoken, ${beats.filter((b) => b.seg === 'chapter').length} chapters, ${beats.filter((b) => b.seg === 'soundbite').length} soundbites)`);
console.log('Next: Claude adds shots to every beat (SKILL.md), then put your voiceover in vo/ and run align.');
