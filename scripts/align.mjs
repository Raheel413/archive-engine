#!/usr/bin/env node
// Lines up YOUR voiceover with the script and cuts it into one audio file per spoken beat.
//   1. Deepgram transcribes vo/voice.(wav|mp3|m4a) with a time for every word.
//   2. The transcript is matched word-by-word to the script (it survives ad-libs, retakes you cut,
//      numbers said differently), so each beat gets its real start time.
//   3. The recording is cut at the beat boundaries (your natural pauses stay in) into vo/bNN.wav,
//      and each beat gets vo, vo_dur and the start time of every word (for exact cut points).
// usage: DEEPGRAM_API_KEY=... node scripts/align.mjs films/<name> [--vo films/<name>/vo/voice.wav]
import fs from 'node:fs';
import path from 'node:path';
import {arg, ff, filmDir, loadFilm, saveFilm, seconds} from './lib.mjs';

const dir = filmDir(process.argv[2]);
const film = loadFilm(dir);
const voDir = path.join(dir, 'vo');
const voFile = arg('--vo', fs.existsSync(voDir) ? fs.readdirSync(voDir).filter((f) => /^voice\.(wav|mp3|m4a|flac|aac|ogg)$/i.test(f)).map((f) => path.join(voDir, f))[0] : null);
if (!voFile || !fs.existsSync(voFile)) { console.error(`Put your voiceover at ${voDir}/voice.wav (or .mp3/.m4a)`); process.exit(2); }

const norm = (w) => w.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]/g, '');
const tokens = (s = '') => s.split(/\s+/).map(norm).filter(Boolean);

// ---- 1. transcript with word times (cached next to the recording)
const cache = voFile + '.words.json';
let words;
if (fs.existsSync(cache) && fs.statSync(cache).mtimeMs > fs.statSync(voFile).mtimeMs) words = JSON.parse(fs.readFileSync(cache, 'utf8'));
else {
  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) { console.error('Set DEEPGRAM_API_KEY'); process.exit(2); }
  const res = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&language=en&punctuate=false&smart_format=false&numerals=false', {
    method: 'POST', headers: {Authorization: `Token ${key}`, 'content-type': 'application/octet-stream'}, body: fs.readFileSync(voFile),
  });
  if (!res.ok) { console.error('Deepgram', res.status, await res.text()); process.exit(1); }
  const j = await res.json();
  words = j.results.channels[0].alternatives[0].words.map((w) => ({w: norm(w.word), s: w.start, e: w.end}));
  fs.writeFileSync(cache, JSON.stringify(words));
}
console.log(`transcript: ${words.length} words, ${seconds(voFile).toFixed(1)} s of audio`);

// ---- 2. match script words to spoken words (global alignment)
const spoken = film.beats.map((b, bi) => ({b, bi})).filter(({b}) => b.text && ['hook', 'line', 'outro', 'quote'].includes(b.seg));
const script = [];
spoken.forEach(({bi, b}) => tokens(b.text).forEach((w, k) => script.push({w, bi, k})));
const n = script.length, m = words.length;
const sim = (a, b) => (a === b ? 2 : (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a))) ? 1 : -1);
const GAP = -1;
// DP over a band would be faster; scripts are a few thousand words so the full table is fine
const score = Array.from({length: n + 1}, () => new Float32Array(m + 1));
const move = Array.from({length: n + 1}, () => new Uint8Array(m + 1));
for (let i = 1; i <= n; i++) { score[i][0] = i * GAP; move[i][0] = 1; }
for (let j = 1; j <= m; j++) { score[0][j] = j * GAP * 0.5; move[0][j] = 2; } // skipping spoken words (retakes, ad-libs) is cheaper
for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) {
  const d = score[i - 1][j - 1] + sim(script[i - 1].w, words[j - 1].w);
  const u = score[i - 1][j] + GAP;
  const l = score[i][j - 1] + GAP * 0.5;
  if (d >= u && d >= l) { score[i][j] = d; move[i][j] = 0; } else if (u >= l) { score[i][j] = u; move[i][j] = 1; } else { score[i][j] = l; move[i][j] = 2; }
}
const hit = new Array(n).fill(null);
for (let i = n, j = m; i > 0 || j > 0;) {
  const mv = move[i][j];
  if (i > 0 && j > 0 && mv === 0) { if (sim(script[i - 1].w, words[j - 1].w) > 0) hit[i - 1] = j - 1; i--; j--; }
  else if (i > 0 && (j === 0 || mv === 1)) i--;
  else j--;
}

// word times per beat (fill unmatched words by interpolation)
const per = new Map();
script.forEach((s, i) => { if (!per.has(s.bi)) per.set(s.bi, []); per.get(s.bi).push(hit[i] != null ? words[hit[i]] : null); });
let missing = 0;
const times = new Map();
for (const {bi} of spoken) {
  const ws = per.get(bi) ?? [];
  const known = ws.map((w, k) => (w ? k : -1)).filter((k) => k >= 0);
  if (!known.length) { times.set(bi, null); missing++; continue; }
  const st = ws.map((w) => (w ? w.s : null));
  const en = ws.map((w) => (w ? w.e : null));
  for (let k = 0; k < st.length; k++) if (st[k] == null) {
    const a = [...known].reverse().find((x) => x < k), b = known.find((x) => x > k);
    if (a != null && b != null) st[k] = en[a] + ((st[b] - en[a]) * (k - a)) / (b - a);
    else if (a != null) st[k] = en[a] + 0.3 * (k - a);
    else st[k] = st[b] - 0.3 * (b - k);
  }
  const lastKnown = known[known.length - 1];
  times.set(bi, {start: st[0], words: st, end: (en[lastKnown] ?? st[st.length - 1]) + 0.3 * (st.length - 1 - lastKnown), matched: known.length / ws.length});
}

// ---- 3. cut the recording
const total = seconds(voFile);
for (const f of fs.readdirSync(voDir)) if (/^b\d+\.(wav|flac)$/.test(f)) fs.unlinkSync(path.join(voDir, f));
spoken.forEach(({b, bi}, idx) => {
  const t = times.get(bi);
  if (!t) { console.warn(`  beat ${bi}: none of its words were found in the recording ("${b.text.slice(0, 50)}...")`); delete b.vo; delete b.vo_dur; delete b.words; return; }
  const LEAD = 0.08;
  const a = Math.max(0, t.start - LEAD);
  // keep the pause up to the next spoken beat when nothing sits between them, otherwise end with a short breath
  const next = spoken[idx + 1];
  const nt = next && times.get(next.bi);
  const adjacent = next && next.bi === bi + 1;
  let e = adjacent && nt ? nt.start - LEAD : Math.min(total, t.end + 0.35);
  if (adjacent && nt && e - t.end > 1.6) e = t.end + 1.2; // a long gap is a mistake or retake: cap the pause
  if (e <= a + 0.2) e = Math.min(total, t.end + 0.2);
  const rel = `vo/b${String(bi).padStart(2, '0')}.flac`;
  ff(['-ss', a.toFixed(3), '-to', e.toFixed(3), '-i', voFile, '-af', 'afade=t=in:d=0.02,afade=t=out:st=' + Math.max(0, e - a - 0.04).toFixed(3) + ':d=0.04', '-ac', '1', '-ar', '48000', path.join(dir, rel)]);
  b.vo = rel;
  b.vo_dur = +(e - a).toFixed(3);
  b.words = t.words.map((s) => +Math.max(0, s - a).toFixed(3));
  if (t.matched < 0.6) console.warn(`  beat ${bi}: only ${(t.matched * 100).toFixed(0)} % of words matched, check it ("${b.text.slice(0, 50)}...")`);
});
saveFilm(dir, film);
const said = spoken.reduce((s, {b}) => s + (b.vo_dur || 0), 0);
console.log(`aligned ${spoken.length - missing}/${spoken.length} spoken beats, ${said.toFixed(1)} s of narration${missing ? `, ${missing} not found` : ''}`);
