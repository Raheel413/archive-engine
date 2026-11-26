// Shared timeline builder. The Remotion composition (pictures) and the Node scripts (validate, mix,
// render) all read time from here, so picture and sound always agree.
//
// A film is a list of beats:
//   line      one sentence of YOUR narration (cut from your voiceover by align.mjs) with the shots under it
//   chapter   dip to black -> chapter card (year + title) with a low boom
//   soundbite the star's own voice: a clip of 5 s or less that plays WITH its audio, subtitled
//   quote     a real quote on a card (your narration reads it, or it holds silent for a few seconds)
// Overlays ride on top of lines: a year stamp, a lower third (name + role), an italic footnote.

export const DIP = 0.6;          // dip to black before a chapter
export const CHAPTER = 3.2;      // chapter card
export const PAD = 0;            // gap after a line (0: your own pauses are kept by align.mjs)
export const WPS = 2.5;          // words per second when there is no voiceover yet (drafts)
export const SOUNDBITE_PAD = 0.25; // breath before and after a soundbite
export const QUOTE_HOLD = 4.5;   // silent quote card
export const STAMP = 3;          // year stamp on screen
export const LOWER = 4;          // lower third on screen
export const FOOTNOTE = 3.5;
export const SWELL = 1.6;        // music swell at chapter dips
export const MAX_CLIP = 5;       // no piece of footage longer than 5 s, ever
export const MAX_STRETCH = 1.25; // a clip may be slowed to at most 80 % speed to cover a line

const words = (s = '') => s.trim().split(/\s+/).filter(Boolean);

export function speechDur(beat) {
  if (beat.vo_dur) return beat.vo_dur;
  return Math.max(1.2, words(beat.text).length / WPS);
}

/** Start time (s) of word index `w` inside a beat: real word times from align.mjs, else by character position. */
export function wordTime(beat, w, dur) {
  if (!w || w <= 0) return 0;
  if (beat.words && beat.words[w]) return Math.min(dur, beat.words[w]);
  const ws = words(beat.text);
  if (!ws.length) return 0;
  const before = ws.slice(0, w).join(' ').length + 1;
  const all = ws.join(' ').length;
  return Math.min(dur, (before / all) * Math.min(dur, speechDur(beat)));
}

/** Split a beat's duration between its shots. `at` (word index) pins where a shot starts. */
function splitShots(beat, dur) {
  const shots = beat.shots ?? [];
  if (!shots.length) return [];
  const starts = shots.map((s) => (s.at != null ? wordTime(beat, s.at, dur) : null));
  starts[0] = 0;
  let i = 0;
  while (i < shots.length) {
    let j = i + 1;
    while (j < shots.length && starts[j] == null) j++;
    const a = starts[i];
    const b = j < shots.length ? starts[j] : dur;
    for (let k = i + 1; k < j; k++) starts[k] = a + ((b - a) * (k - i)) / (j - i);
    i = j;
  }
  return shots.map((shot, k) => ({shot, start: starts[k], dur: (k + 1 < shots.length ? starts[k + 1] : dur) - starts[k]}));
}

export function buildTimeline(film) {
  const fps = film.fps ?? 30;
  const items = [];      // full-frame visuals, back to back
  const overlays = [];   // year stamps, lower thirds, footnotes
  const audio = {vo: [], bites: [], booms: [], whooshes: [], swells: [], duck: []};
  let t = 0;
  let chapter = 0;

  film.beats.forEach((beat, bi) => {
    if (beat.seg === 'chapter') {
      if (items.length) {
        items.push({type: 'dip', from: t, dur: DIP});
        audio.swells.push([t, t + SWELL]);
        t += DIP;
      }
      chapter += 1;
      items.push({type: 'chapter', from: t, dur: CHAPTER, beat, bi, chapter});
      audio.booms.push(t);
      t += CHAPTER;
      return;
    }

    if (beat.seg === 'soundbite') {
      const shot = (beat.shots ?? [])[0] ?? {};
      const dur = Math.min(MAX_CLIP, shot.dur ?? beat.dur ?? 3.5);
      t += SOUNDBITE_PAD;
      items.push({type: 'soundbite', from: t, dur, shot, beat, bi});
      if (shot.audio) audio.bites.push({file: shot.audio, start: t, dur, bi});
      audio.duck.push([t - 0.2, t + dur + 0.2]);
      if (beat.who) overlays.push({type: 'lower', from: t + 0.2, dur: Math.min(LOWER, dur - 0.2), name: beat.who, role: beat.role, high: true});
      t += dur + SOUNDBITE_PAD;
      return;
    }

    if (beat.seg === 'quote') {
      const spoken = !!(beat.vo || beat.text);
      const dur = spoken ? speechDur(beat) + 0.6 : QUOTE_HOLD;
      items.push({type: 'quote', from: t, dur, beat, bi});
      if (beat.vo) audio.vo.push({file: beat.vo, start: t + 0.3, bi});
      audio.whooshes.push(t);
      t += dur;
      return;
    }

    // line (hook / line / outro): narration with shots under it
    const dur = speechDur(beat) + (beat.vo ? PAD : 0.15);
    if (beat.vo) audio.vo.push({file: beat.vo, start: t, bi});
    for (const s of splitShots(beat, dur)) {
      items.push({type: 'shot', from: t + s.start, dur: s.dur, shot: s.shot, beat, bi});
      if (s.shot.kind === 'print' || s.shot.kind === 'page') audio.whooshes.push(t + s.start);
    }
    if (!beat.shots?.length) items.push({type: 'shot', from: t, dur, shot: {kind: 'photo', q: '(no shot)'}, beat, bi});
    if (beat.year) overlays.push({type: 'stamp', from: t + 0.15, dur: Math.min(STAMP, dur), text: String(beat.year)});
    if (beat.lower) overlays.push({type: 'lower', from: t + 0.3, dur: Math.min(LOWER, dur), name: beat.lower.name, role: beat.lower.role});
    if (beat.note) {
      const at = beat.note_at != null ? wordTime(beat, beat.note_at, dur) : 0.3;
      overlays.push({type: 'footnote', from: t + at, dur: FOOTNOTE, text: beat.note});
    }
    t += dur;
  });

  const total = t + 0.5;
  return {fps, items, overlays, audio, total, frames: Math.ceil(total * fps)};
}
