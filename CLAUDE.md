# archive-engine: how to make a video here

This repo turns a script into a 15-20 minute archive documentary about a film star of the 1960s-90s,
built to the bar of the YouTube channel Dodford. Read `SKILL.md` (the director's manual) and
`SOURCES.md` (where footage comes from) before planning or changing any film.

## The job, start to finish

1. **Script.** Use the person's script if they give one. If they ask you to write it: research the star
   with web search first and fact-check every name, year, number and quote against at least one solid
   source. Where sources disagree, write around it ("in the 1950s") instead of picking one. Write it in
   the format in `scripts/start.mjs` (`# 1968 | Chapter`, `> Star: exact words` for soundbites,
   `" quote " -- Name`). Length: about 150 spoken words per minute, so 15-20 min = 2,300-3,000 words.
   Chapters every 2-4 minutes. A soundbite every 60-90 s, only with words the star really said on camera.
2. **Writing rules (strict).** It must read like a human wrote it. Never use the "it's not X, it's Y" /
   "not X but Y" / "not because X, but because Y" construction. Never use AI-tell words (delve,
   testament, tapestry, pivotal, showcase, underscore, realm, intricate, vibrant, embark, journey as a
   metaphor). Short sentences, concrete facts, specific names and numbers, a hook in the first 15 s.
3. **Beats.** `node scripts/start.mjs films/<slug> --star "Full Name" --title "Video Title"`.
   Never edit a beat's `text` after this: it must match the voiceover word for word.
4. **Shot plan.** Add shots to every beat following SKILL.md: a new visual every 2-5 s, the star's real
   footage first, `film` + `year` for stills and posters, `star: false` for anyone or anything else,
   `year` on lines where time jumps, `lower` the first time a person appears. Set `star.era`.
5. **Voice.** Ask the person: their own recording (`films/<slug>/vo/voice.mp3`) or a Deepgram voice
   (`"voice": "aura-2-zeus-en"` in film.json; also aura-2-orion-en, aura-2-arcas-en, aura-2-apollo-en).
6. **Check and push.** `node scripts/validate.mjs films/<slug> --allow-missing`, fix errors, then commit
   and push to main. GitHub does the rest (hunt, face check, vision check, voice, render, mix).
7. **Watch the run.** `gh run watch` or `gh run list`. When it finishes, `gh run download <id> -n <slug>`
   gets the MP4, contact sheet and credits. Look at the contact sheet yourself.
8. **Fix bad shots** (wrong person, wrong decade, logo, dull frame):
   `node scripts/redo.mjs films/<slug> b05-0,b07-1 "sharper query"`, commit, push. Repeat until the
   contact sheet is clean and the run renders in 1080p (it renders a 540p draft while shots are missing).
9. **Deliver.** Tell the person where the MP4 is, how many shots came from where, what is still weak,
   and paste the credits block from `<slug>.description.txt`.

## Rules

- Every clip is 5 seconds or less and every asset is credited. The engine enforces both: don't work around it.
- Never put API keys in any file in this repo. Keys live in GitHub secrets and in a local `.env` (git-ignored).
- YouTube blocks GitHub. YouTube-only shots need the `HUNT_PROXY` secret or the laptop hunt (`hunt/run.ps1`).
- Shot ids are `b<beat>-<shot>`, counted from 0 in film.json.
- If something in the engine is broken, fix it in the engine (hunt/, scripts/, src/), test it, and say what you changed.
