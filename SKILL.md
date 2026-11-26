---
name: archive-engine
description: Turn Raheel's script and voiceover into a classic-Hollywood archive documentary (stars of the 60s-90s, 15-20 min) with this repo. Use when asked to plan shots, make, fix or re-hunt a film here.
---

# Archive Engine: director's manual

Raheel gives you a **script** and records the **voiceover** himself. You turn the script into
`films/<name>/film.json` with a shot plan for every beat. The engine does the rest: archive hunt with
face check, 5-second cap, credits, cutting his VO into beats, parallel render on GitHub, audio master.
Read this whole file and `SOURCES.md` before planning a film.

## 1. The quality bar: Dodford (@DodfordYT)

Dodford's tagline is "The whole story. In their own words." Its videos have no narrator: they are cut
from the star's own interviews against film clips and news reports. Our format keeps Raheel's narration
and borrows the DNA:

- **The star's own voice every 60-90 s.** A `soundbite` beat: 2-5 s of the star saying something
  sharp, from a real interview, played with its audio and subtitled. These are the strongest moments.
- **Pace.** A new visual every 2-5 s. Never hold one picture past ~6 s. The hook cuts every 1.5-3 s.
- **Real things only.** Footage of the star, stills from the actual films, real headlines. No stock
  footage, no AI images, no generic "Hollywood sign" filler when a specific picture exists.
- **Specific beats get specific visuals.** A line about Bullitt shows Bullitt. A line about his mother
  shows a photo of his mother, or a clipping about her, never a random woman.

## 2. Script → beats

Raheel's `script.txt` (format in `scripts/start.mjs`): `# 1968 | Title` = chapter, `> Name: words` =
soundbite, `" quote " -- Name` = quote card, everything else = narration. Run:

```
node scripts/start.mjs films/<name> --star "Steve McQueen" --title "The King of Cool"
```

That writes one beat per sentence. Never change his words in `text`: align.mjs matches them to his
recording. You add `shots`, `year`, `lower`, `note`, and you may add soundbite beats (Section 5) if he agrees.

## 3. Shots

| kind | use for | required |
|---|---|---|
| `clip` | footage of the star: interviews (muted), premieres, on set, TV appearances, film scenes, newsreels | `q` (or `url`) |
| `photo` | portraits, publicity stills, candids, family photos | `q`, or `film` + `year` for a still from that movie |
| `poster` | the film's poster or a magazine cover | `film` + `year`, or `q` |
| `print` | a newspaper or magazine scan, highlighted | `q` + `find` (exact words on the page) |
| `page` | a web article screenshot, highlighted | `url` + `find` |
| `soundbite` | the star's own voice (only in soundbite beats) | `find` = the exact words, `q` = which interview |

Options on any shot: `year` (the hunter prefers that year), `from` (sources, see SOURCES.md), `at`
(word index where the shot starts), `star: false` (no face check: places, crowds, other people, cars),
`url` (+ `t` seconds) to force an exact source.

**Queries** describe the frame, 3-7 words, with name and year: `"Steve McQueen Bullitt 1968 on set"`,
`"Steve McQueen interview 1970"`, `"Steve McQueen Le Mans 1971 racing"`. For other people, set `star:false`
and name them: `{"kind":"photo","q":"Neile Adams 1960","star":false}`.

**How many:** body lines up to ~5 s get one shot; longer lines get two or three, split with `at` on a
noun. Hook lines get a shot every 1.5-3 s. A clip is at most 5 s and can stretch to 6.2 s; past that it
freezes, so add a shot. Mix kinds: in every minute aim for ~50 % clips, ~30 % photos/posters, ~10 %
print, plus a soundbite.

**Overlays on a line:** `"year": 1968` (stamp top-left, use when time jumps), `"lower": {"name": "Neile
Adams", "role": "First wife"}` (first time a person appears), `"note": "..."` (italic caveat top-right).

## 4. Chapters and quotes

Chapters every 2-4 minutes, titled like a film essay, not a Wikipedia heading: "The Boy From Nowhere",
"Faster Than Anyone", "The Last Ride". Give a `year` whenever the chapter starts in one.
Quote cards: only real, sourced quotes. Raheel's voice reads them.

## 5. Soundbites

The hunter searches interviews, reads their captions (or transcribes them), finds the words in `find`
and cuts 5 s or less with audio. So `find` must be words the star really said on camera, as close to
verbatim as possible. Search for real quotes from TV interviews (Cavett, Carson, Parkinson, Frost, BBC,
AP press junkets) and give the interview in `q`: `"q": "Steve McQueen Dick Cavett 1970"`. If the line
runs over 5 s the hunter keeps the first 5 s and subtitles only what is said in it.

## 6. film.json

```json
{
  "title": "The King of Cool",
  "star": {"name": "Steve McQueen", "era": [1960, 1980]},
  "look": {"grain": 0.06, "vignette": 0.45},
  "beats": [
    {"seg": "hook", "text": "In 1968 the most famous man in Hollywood ...", "year": 1968, "shots": [
      {"kind": "clip", "q": "Steve McQueen Bullitt 1968 car chase", "from": ["youtube", "archive"]},
      {"kind": "photo", "film": "Bullitt", "year": 1968, "at": 7},
      {"kind": "clip", "q": "Steve McQueen 1968 premiere", "at": 13}]},
    {"seg": "chapter", "title": "The Boy From Nowhere", "year": "1930"},
    {"seg": "line", "text": "He was born in Beech Grove, Indiana.", "shots": [
      {"kind": "photo", "q": "Beech Grove Indiana 1930s", "star": false}]},
    {"seg": "line", "text": "By fourteen he was in a reform school in California.", "shots": [
      {"kind": "print", "q": "Steve McQueen Boys Republic Chino", "find": "Boys Republic"}]},
    {"seg": "soundbite", "who": "Steve McQueen", "shots": [
      {"kind": "soundbite", "q": "Steve McQueen interview 1970", "find": "When I believe in something, I fight like hell for it."}]},
    {"seg": "quote", "text": "I'd rather wake up in the middle of nowhere...", "quote": "I'd rather wake up in the middle of nowhere...", "by": "Steve McQueen"}
  ]
}
```

## 7. Make it

1. `node scripts/validate.mjs films/<name> --allow-missing` and fix every error.
2. Raheel puts his voiceover at `films/<name>/vo/voice.mp3` (mp3 or m4a, under 100 MB) and pushes.
3. GitHub hunts what it can reach, cuts his VO into beats, and renders if everything is found.
4. Missing footage (YouTube): Raheel runs `.\hunt\run.ps1 <name>` on his laptop. It uploads and the render restarts.
5. Bad pick: `.\hunt\run.ps1 <name> -Redo b05-0,b07-1`. Shot ids are `b<beat>-<shot>`, listed in credits.md.
6. Artifacts: the MP4, a contact sheet, credits.md and `<name>.description.txt` (credits block for YouTube).
