#!/usr/bin/env node
// Writes out/<name>.description.txt: the credits block for the YouTube description,
// grouped by source, one line per uploader, with links. Also refreshes films/<name>/credits.md.
// usage: node scripts/credits.mjs films/<name>
import fs from 'node:fs';
import path from 'node:path';
import {filmDir, loadFilm} from './lib.mjs';

const dir = filmDir(process.argv[2]);
const film = loadFilm(dir);
const rows = [];
film.beats.forEach((b, bi) => (b.shots ?? []).forEach((s, si) => {
  if (s.src) rows.push({sid: `b${String(bi).padStart(2, '0')}-${si}`, ...s});
}));

// credits.md: every shot
const md = ['# Credits', '', '| Shot | Type | Credit | Source | At (s) |', '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.sid} | ${r.kind} | ${r.credit ?? ''} | ${r.source ?? r.url ?? ''} | ${r.src_t ?? ''} |`)];
fs.writeFileSync(path.join(dir, 'credits.md'), md.join('\n') + '\n');

// description: grouped by who, deduplicated
const groups = new Map();
for (const r of rows) {
  const who = (r.credit ?? 'Unknown').trim();
  if (!groups.has(who)) groups.set(who, new Set());
  if (r.source || r.url) groups.get(who).add(r.source ?? r.url);
}
const lines = ['ARCHIVE SOURCES', 'Archive footage, photographs and print used for commentary, criticism and education. All rights belong to their owners.', ''];
for (const [who, links] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(who);
  for (const l of links) lines.push(`  ${l}`);
}
fs.mkdirSync('out', {recursive: true});
const out = path.join('out', `${film.id}.description.txt`);
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`credits: ${rows.length} shots from ${groups.size} sources -> ${out}`);
