# Setting up archive-engine (for a new teammate)

You make 15-20 minute archive documentaries about 1960s-90s film stars. Claude Code does the work;
GitHub renders the video. You never edit video by hand.

## Option A: work inside Raheel's repo (easiest)

Raheel adds you as a collaborator (GitHub repo -> Settings -> Collaborators -> Add people).
The API keys are already stored as secrets in his repo, so **you need no API keys at all** for
cloud rendering. You need:

1. A GitHub account (accept the collaborator invite in your email).
2. Claude Code with a Claude Pro or Max plan: https://claude.com/claude-code
3. Git and the GitHub CLI. On Windows:
   ```
   winget install Git.Git GitHub.cli OpenJS.NodeJS.LTS
   ```
   then close and reopen PowerShell and run `gh auth login` (GitHub.com, HTTPS, Yes, browser).
4. The repo:
   ```
   cd D:\projects
   git clone https://github.com/Raheel413/archive-engine
   cd archive-engine
   npm ci
   claude
   ```

## Option B: your own copy (fork)

Fork the repo on GitHub, then add these secrets in **your fork** (Settings -> Secrets and variables ->
Actions -> New repository secret). Paste each value with **no space before it**.

| Secret | Needed? | What it does | Where to get it |
|---|---|---|---|
| `DEEPGRAM_API_KEY` | yes | the AI voice, cutting voice into beats, finding soundbites | console.deepgram.com (free credit on sign-up) |
| `TMDB_API_KEY` | yes | star portraits for the face check, film stills, posters | themoviedb.org -> Settings -> API (free; use the short "API Key") |
| `GEMINI_API_KEY` | yes | vision check: right person, right decade, no logos or subtitles | aistudio.google.com -> Get API key (free tier) |
| `SERPER_API_KEY` | yes | Google video and image search | serper.dev (free credits on sign-up) |
| `YOUTUBE_API_KEY` | yes | YouTube search | console.cloud.google.com -> enable "YouTube Data API v3" -> Credentials -> API key (free quota) |
| `HUNT_PROXY` | optional | lets GitHub download from YouTube (talk-show soundbites) | a residential proxy network (Bright Data, Oxylabs, Decodo, IPRoyal, Webshare): the `http://user:pass@host:port` line from their dashboard. Not a desktop app. |

Also in your fork: Actions tab -> enable workflows.

## Optional: hunting YouTube from your own computer (no proxy)

```
winget install Python.Python.3.12 Gyan.FFmpeg UB-Mannheim.TesseractOCR DenoLand.Deno
```
Add `C:\Program Files\Tesseract-OCR` to PATH. Create `.env` in the repo folder with the keys above
(one per line, `NAME=value`, no spaces), check them with `node scripts/check_keys.mjs`, then:
```
.\hunt\run.ps1 <film-name>
```

## Making a video

Open Claude Code in the repo folder (`claude`) and paste the prompt Raheel gave you. Claude reads
`CLAUDE.md` and `SKILL.md`, writes or takes your script, plans every shot, pushes, watches the GitHub
run, fixes bad shots and hands you the finished MP4 and the YouTube credits text.
