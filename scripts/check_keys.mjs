#!/usr/bin/env node
// Tests every API key with one tiny real request. Reads .env, then the environment.
// usage: node scripts/check_keys.mjs
import fs from 'node:fs';

if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} else console.log('No .env file in this folder (run this inside archive-engine)\n');

const k = (n) => process.env[n];
const T = () => ({signal: AbortSignal.timeout(15000)}); // a fresh 15 s timer per request
const checks = [
  ['DEEPGRAM_API_KEY', 'cut your voiceover, find soundbites', () =>
    fetch('https://api.deepgram.com/v1/projects', {...T(), headers: {Authorization: `Token ${k('DEEPGRAM_API_KEY')}`}})],
  ['TMDB_API_KEY', 'star photos for the face check, film stills, posters', () =>
    fetch(`https://api.themoviedb.org/3/search/person?query=Steve%20McQueen&api_key=${k('TMDB_API_KEY')}`, T())],
  ['YOUTUBE_API_KEY', 'YouTube search', () =>
    fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=AP%20Archive&type=video&maxResults=1&key=${k('YOUTUBE_API_KEY')}`, T())],
  ['SERPER_API_KEY', 'Google search: Vimeo, OK.ru, images, LIFE scans', () =>
    fetch('https://google.serper.dev/search', {...T(), method: 'POST', headers: {'X-API-KEY': k('SERPER_API_KEY'), 'Content-Type': 'application/json'}, body: JSON.stringify({q: 'Steve McQueen', num: 1})})],
];

let bad = 0;
for (const [name, use, call] of checks) {
  if (!k(name)) { console.log(`MISSING  ${name}  (${use})`); bad++; continue; }
  process.stdout.write(`testing  ${name} ... `);
  try {
    const r = await call();
    if (r.ok) console.log('OK');
    else {
      const body = (await r.text()).slice(0, 160).replace(/\s+/g, ' ');
      console.log(`FAILED  HTTP ${r.status}: ${body}`);
      bad++;
    }
  } catch (e) {
    console.log(`FAILED  ${e.name === 'TimeoutError' ? 'no answer in 15 s (internet, firewall or VPN blocking it?)' : e.message}`);
    bad++;
  }
}
console.log(bad ? `\n${bad} key(s) need fixing` : '\nAll keys work.');
process.exit(bad ? 1 : 0);
