#!/usr/bin/env node
// Makes the voiceover with Deepgram's voices instead of your own recording, then saves it as
// vo/voice.mp3 so the normal align step cuts it into beats (same path as a human recording).
// It only runs when the film has "voice" set and there is no vo/voice.* yet.
// usage: DEEPGRAM_API_KEY=... node scripts/vo_tts.mjs films/<name> [--voice aura-2-zeus-en] [--force]
// American male voices: aura-2-zeus-en (deep, documentary), aura-2-orion-en (calm), aura-2-arcas-en (smooth), aura-2-apollo-en (casual)
import fs from 'node:fs';
import path from 'node:path';
import {arg, ff, filmDir, flag, loadFilm} from './lib.mjs';

const dir = filmDir(process.argv[2]);
const film = loadFilm(dir);
const voice = arg('--voice', film.voice);
const voDir = path.join(dir, 'vo');
const existing = fs.existsSync(voDir) ? fs.readdirSync(voDir).find((f) => /^voice\.(wav|mp3|m4a|flac|aac|ogg)$/i.test(f)) : null;
if (!voice) { console.log('vo_tts: no "voice" in film.json, expecting your own recording'); process.exit(0); }
if (existing && !flag('--force')) { console.log(`vo_tts: ${existing} already there`); process.exit(0); }
const key = process.env.DEEPGRAM_API_KEY;
if (!key) { console.error('Set DEEPGRAM_API_KEY'); process.exit(2); }
fs.mkdirSync(voDir, {recursive: true});

async function speak(text, file) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(`https://api.deepgram.com/v1/speak?model=${voice}&encoding=linear16&sample_rate=48000&container=wav`, {
      method: 'POST', headers: {Authorization: `Token ${key}`, 'content-type': 'application/json'}, body: JSON.stringify({text}),
    });
    if (r.ok) { fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return; }
    const body = await r.text();
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 2000 * attempt)); continue; }
    throw new Error(`Deepgram ${r.status}: ${body}`);
  }
  throw new Error('Deepgram kept failing');
}

// one take per spoken beat, joined with natural pauses (longer around chapters and soundbites)
const tmp = fs.mkdtempSync(path.join(voDir, '.tts-'));
const parts = [];
const spoken = film.beats.map((b, i) => ({b, i})).filter(({b}) => b.text && ['hook', 'line', 'outro', 'quote'].includes(b.seg));
for (const [n, {b, i}] of spoken.entries()) {
  const f = path.join(tmp, `${String(n).padStart(3, '0')}.wav`);
  await speak(b.text, f);
  const next = spoken[n + 1];
  const gap = !next ? 0.6 : next.i === i + 1 ? 0.35 : 0.9;
  const g = path.join(tmp, `${String(n).padStart(3, '0')}g.wav`);
  ff(['-f', 'lavfi', '-i', `anullsrc=r=48000:cl=mono`, '-t', String(gap), g]);
  parts.push(f, g);
  process.stdout.write(`\rvo_tts: ${n + 1}/${spoken.length} lines`);
}
const list = path.join(tmp, 'list.txt');
fs.writeFileSync(list, parts.map((p) => `file '${path.resolve(p)}'`).join('\n'));
ff(['-f', 'concat', '-safe', '0', '-i', list, '-ac', '1', '-ar', '48000', '-b:a', '192k', path.join(voDir, 'voice.mp3')]);
fs.rmSync(tmp, {recursive: true, force: true});
console.log(`\nvo_tts: ${voice} -> ${path.join(voDir, 'voice.mp3')}`);
