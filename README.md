# Archive Engine

Your script + your voiceover → a 15–20 minute classic-Hollywood documentary (stars of the 60s, 70s,
80s, 90s), built to the Dodford bar. Real archive footage only, every piece 5 seconds or less, every
piece credited, rendered on GitHub.

What it does by itself:
- **Hunts archives** (YouTube archive channels, Internet Archive, Dailymotion, Vimeo, OK.ru, TMDB, Wikimedia Commons, LIFE on Google Books, newspaper scans). Full map: `SOURCES.md`.
- **Face check**: every clip and photo of the star is compared with reference photos of them, so a "Steve McQueen 1968" search can't give you Paul Newman.
- **5-second cap**: finds a clean camera shot (no cut inside it), cuts 5 s or less, rejects burned-in captions, news tickers and watermarks, deinterlaces old TV tape, scales to 1080p.
- **Soundbites in the star's own voice**: finds the exact words inside real interviews (captions or transcription) and cuts them with audio and subtitles.
- **Newspaper and magazine clippings**: OCRs the scan, highlights your words, pushes the camera into the line.
- **Your voiceover**: one recording in, cut into beats with word-level timing, so every cut lands on your words.
- **Credits**: on screen bottom-left, `credits.md` per shot, and a ready-to-paste YouTube description block.
- **Look**: serif chapter cards with the year, year stamps, lower thirds, quote cards, one even grain and vignette over everything so 1962 and 1994 footage feel like one film.

## One-time setup

### 1. GitHub secrets (Settings → Secrets and variables → Actions)

| Secret | What for | Where |
|---|---|---|
| `DEEPGRAM_API_KEY` | cutting your voiceover into beats; finding soundbites in videos without captions | the key you already use |
| `TMDB_API_KEY` | star portraits (face-check references), film stills, posters | themoviedb.org → Settings → API (free) |
| `YOUTUBE_API_KEY` | YouTube search | console.cloud.google.com → YouTube Data API v3 → API key |
| `GEMINI_API_KEY` | vision check: every frame must be the right person, the right decade, with no logos, subtitles or watermarks | aistudio.google.com → Get API key |
| `SERPER_API_KEY` | Google search for Vimeo, OK.ru, images, LIFE scans | serper.dev |

Optional, `HUNT_PROXY`: a residential proxy URL (`http://user:pass@host:port`). With it, GitHub downloads YouTube itself and you never need the laptop step.

### 2. Your laptop (YouTube blocks GitHub's machines, your home connection gets through)

```
winget install Python.Python.3.12 OpenJS.NodeJS.LTS Git.Git Gyan.FFmpeg UB-Mannheim.TesseractOCR DenoLand.Deno GitHub.cli
```
Add `C:\Program Files\Tesseract-OCR` to PATH, then:
```
gh auth login
git clone https://github.com/Raheel413/archive-engine
cd archive-engine
npm ci
```
Make a `.env` file in that folder (never uploaded) with the same four keys: `DEEPGRAM_API_KEY=...` etc.

## Making a video

1. Make `films/<name>/script.txt` (format in `scripts/start.mjs`: `# 1968 | Chapter`, `> Star: words` for soundbites, `" quote " -- Star`).
2. Ask Claude (in this repo) to plan the film: it runs `start.mjs` and writes every shot into `film.json` following `SKILL.md`.
3. Record your voiceover reading the script exactly (mistakes and retakes are fine, it skips them). Save it as `films/<name>/vo/voice.mp3`. Push.
4. GitHub runs **Actions → Make video**: hunts what it can reach, cuts your voice into beats, checks the rules.
5. If footage is missing, on your laptop:
   ```
   .\hunt\run.ps1 <name>                     # find the rest, upload, render starts again by itself
   .\hunt\run.ps1 <name> -Redo b05-0,b07-1   # replace shots you don't like (ids in credits.md)
   .\hunt\run.ps1 <name> -Only soundbite     # just one kind
   ```
6. Download from **Artifacts** on the run: the MP4, a contact sheet, `credits.md`, and `<name>.description.txt`.

Want to see it before every shot is found? **Actions → Make video → Run workflow**, quality = `draft` (missing shots show as red cards).

Footage is stored in a GitHub Release per film (`assets-<name>`), not in git: an 18-minute film is about 1 GB of clips.

## Music

Put 3-6 tracks in `music/` (or `films/<name>/music/` for one film). They play in turn with crossfades, swell at chapters and duck 8 dB under every soundbite. With none, a quiet generated bed plays.

## Local commands

```
node scripts/validate.mjs films/<name> --allow-missing
node scripts/align.mjs films/<name>                                    # cut your voiceover
node scripts/render.mjs films/<name> --scale 0.5 --from 0 --to 60      # 540p preview of the first minute
node scripts/credits.mjs films/<name>
npm run studio
```

This repo is public unless you switch it to private (Settings). Private repos use your 3,000 Actions minutes a month on GitHub Pro.
