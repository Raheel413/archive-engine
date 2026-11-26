#!/usr/bin/env node
// Audio mix and mastering, then mux with the rendered picture.
// usage: node scripts/mix.mjs films/<name> --video out/<name>.video.mp4 [--out out/<name>.mp4]
//
//  A1 voiceover : high-pass 70 Hz, de-ess, 3:1 compression, +120 Hz low shelf, +4 kHz high shelf, -14 LUFS, peaks near -3 dB
//  A2 music bed : low-passed, sits around -30 LUFS under the voice, swells +4 dB for 1.5 s at every chapter dip
//                 uses films/<name>/music/* or music/* if you add tracks (several tracks play in turn), otherwise a generated synth bed
//  A3 sfx       : low boom at -14 dB on chapter cards, soft whooshes at -20 dB when a clipping or quote card lands
//  A4 soundbites: the star's own voice from the archive clips, cleaned (high-pass, gentle compression), each at -16 LUFS;
//                 the music ducks 8 dB under every soundbite
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildTimeline} from '../src/timeline.mjs';
import {arg, decode, ff, filmDir, loadFilm, seconds, writeWav} from './lib.mjs';

const RATE = 48000;
const dir = filmDir(process.argv[2]);
const film = loadFilm(dir);
const video = arg('--video', `out/${film.id}.video.mp4`);
const out = arg('--out', `out/${film.id}.mp4`);
const work = path.join('out', `.mix-${film.id}`);
fs.mkdirSync(work, {recursive: true});
const tl = buildTimeline(film);
const total = Math.max(tl.total, fs.existsSync(video) ? seconds(video) : 0);
const N = Math.ceil(total * RATE);

const place = (buf, samples, at, gain = 1) => {
  const o = Math.round(at * RATE);
  for (let i = 0; i < samples.length && o + i < buf.length; i++) if (o + i >= 0) buf[o + i] += samples[i] * gain;
};

// ---- sound kit
const kit = 'sounds';
if (!['boom.wav', 'whoosh.wav'].every((f) => fs.existsSync(path.join(kit, f))) || !fs.existsSync(path.join(kit, 'bed.wav')) || seconds(path.join(kit, 'bed.wav')) < total + 2) {
  execFileSync(process.execPath, ['scripts/make_sounds.mjs', '--out', kit, '--bed-seconds', String(Math.ceil(total + 10))], {stdio: 'inherit'});
}

// ---- A1 voiceover
const vo = new Float32Array(N);
for (const v of tl.audio.vo) place(vo, decode(path.join(dir, v.file), RATE), v.start);
writeWav(path.join(work, 'vo_raw.wav'), vo, RATE);
ff(['-i', path.join(work, 'vo_raw.wav'), '-af',
  'highpass=f=70,deesser=i=0.5:m=0.5:f=0.5,acompressor=threshold=-20dB:ratio=3:attack=5:release=90:makeup=3,' +
  'bass=g=2.5:f=120:w=0.7,treble=g=2:f=4000:w=0.7,loudnorm=I=-14:TP=-3:LRA=9',
  '-ar', String(RATE), path.join(work, 'vo.wav')]);

// ---- A3 sfx
const sfx = new Float32Array(N);
const boom = decode(path.join(kit, 'boom.wav'), RATE);
const whoosh = decode(path.join(kit, 'whoosh.wav'), RATE);
tl.audio.booms.forEach((t) => place(sfx, boom, t, 0.8));
tl.audio.whooshes.forEach((t) => place(sfx, whoosh, t - 0.25, 0.8));
writeWav(path.join(work, 'sfx.wav'), sfx, RATE);

// ---- A4 soundbites: each one cleaned and levelled on its own, then placed
const bites = new Float32Array(N);
tl.audio.bites.forEach((b, i) => {
  const src = path.join(dir, b.file);
  if (!fs.existsSync(src)) return;
  const tmp = path.join(work, `bite-${i}.wav`);
  ff(['-i', src, '-t', String(b.dur), '-af', 'highpass=f=90,lowpass=f=9000,acompressor=threshold=-22dB:ratio=2.5:attack=8:release=120,loudnorm=I=-16:TP=-3,afade=t=in:d=0.08,afade=t=out:st=' + Math.max(0, b.dur - 0.15).toFixed(2) + ':d=0.15', '-ac', '1', '-ar', String(RATE), tmp]);
  place(bites, decode(tmp, RATE), b.start);
});
writeWav(path.join(work, 'bites.wav'), bites, RATE);

// ---- A2 music
const musicDir = [path.join(dir, 'music'), 'music'].find((d) => fs.existsSync(d) && fs.readdirSync(d).some((f) => /\.(mp3|wav|m4a|ogg|flac)$/i.test(f)));
let bedSrc = path.join(kit, 'bed.wav');
if (musicDir) {
  const tracks = fs.readdirSync(musicDir).filter((f) => /\.(mp3|wav|m4a|ogg|flac)$/i.test(f)).sort().map((f) => path.join(musicDir, f));
  const seq = [];
  let len = 0;
  for (let i = 0; len < total + 5; i++) { const t = tracks[i % tracks.length]; seq.push(t); len += seconds(t) - 3; }
  const inputs = seq.flatMap((t) => ['-i', t]);
  let fc = seq.map((_, i) => `[${i}]aformat=sample_rates=${RATE}:channel_layouts=stereo[s${i}]`).join(';');
  let last = 's0';
  for (let i = 1; i < seq.length; i++) { fc += `;[${last}][s${i}]acrossfade=d=3[x${i}]`; last = `x${i}`; }
  ff([...inputs, '-filter_complex', fc, '-map', `[${last}]`, '-t', String(total + 1), path.join(work, 'music_joined.wav')]);
  bedSrc = path.join(work, 'music_joined.wav');
  console.log(`music: ${tracks.length} track(s) from ${musicDir}`);
} else console.log('music: generated synth bed (add tracks to music/ to use your own)');
const swell = tl.audio.swells.map(([a, b]) => `clip((t-${a.toFixed(2)})/0.3,0,1)*clip((${b.toFixed(2)}-t)/0.4,0,1)`).join('+') || '0';
const duck = tl.audio.duck.map(([a, b]) => `clip((t-${(a - 0.3).toFixed(2)})/0.3,0,1)*clip((${(b + 0.3).toFixed(2)}-t)/0.3,0,1)`).join('+') || '0';
ff(['-i', bedSrc, '-t', String(total), '-af',
  `lowpass=f=3500,loudnorm=I=-29:TP=-9:LRA=7,volume='(1+0.585*(${swell}))*(1-0.6*min(1,${duck}))':eval=frame,afade=t=in:d=1,afade=t=out:st=${Math.max(0, total - 2.5).toFixed(2)}:d=2.5`,
  '-ar', String(RATE), '-ac', '2', path.join(work, 'music.wav')]);

// ---- master and mux
const master = [
  '[1]pan=stereo|c0=c0|c1=c0[v]', '[3]pan=stereo|c0=c0|c1=c0[s]', '[2]anull[m]', '[4]pan=stereo|c0=c0|c1=c0[b]',
  `[v][m][s][b]amix=inputs=4:normalize=0:duration=longest,alimiter=limit=0.89:level=false,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=${RATE}[a]`,
].join(';');
fs.mkdirSync(path.dirname(out), {recursive: true});
if (fs.existsSync(video)) {
  ff(['-i', video, '-i', path.join(work, 'vo.wav'), '-i', path.join(work, 'music.wav'), '-i', path.join(work, 'sfx.wav'), '-i', path.join(work, 'bites.wav'),
    '-filter_complex', master, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', out]);
} else {
  // no picture yet: write the mix on its own so it can be checked
  ff(['-f', 'lavfi', '-i', 'anullsrc', '-i', path.join(work, 'vo.wav'), '-i', path.join(work, 'music.wav'), '-i', path.join(work, 'sfx.wav'), '-i', path.join(work, 'bites.wav'),
    '-filter_complex', master, '-map', '[a]', '-t', String(total), out.replace(/\.mp4$/, '.wav')]);
}
console.log('wrote', fs.existsSync(video) ? out : out.replace(/\.mp4$/, '.wav'));
