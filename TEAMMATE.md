# Setting up archive-engine (for a new teammate)

You make 15-20 minute archive documentaries about 1960s-90s film stars. Claude Code does the work;
GitHub renders the video. You never edit video by hand.

## Setup: clone it into your own GitHub repo

Cloning copies the code to your computer. To have GitHub render videos for you, the code must live in
**your own** GitHub repo, with **your own** API keys stored there as secrets.

### 1. Install the tools (Windows, PowerShell)
```
winget install Git.Git GitHub.cli OpenJS.NodeJS.LTS
```
Close and reopen PowerShell, then `gh auth login` (GitHub.com, HTTPS, Yes, Login with a web browser).
Install Claude Code too (Claude Pro or Max plan): https://claude.com/claude-code

### 2. Clone and make it your repo
```
mkdir D:\projects -Force
cd D:\projects
git clone https://github.com/Raheel413/archive-engine
cd archive-engine
npm ci
git remote remove origin
gh repo create archive-engine --public --source . --push
```
This creates `github.com/<you>/archive-engine` with all the code. Keep it **public**: public repos get
unlimited free GitHub render minutes. (Private works too but uses your 2,000-3,000 free minutes a month.)

### 3. Add your API keys as secrets
On GitHub: your repo -> Settings -> Secrets and variables -> Actions -> New repository secret.
Paste each value with **no space before it**.

| Secret | Needed? | What it does | Where to get it |
|---|---|---|---|
| `DEEPGRAM_API_KEY` | yes | the AI voice, cutting voice into beats, finding soundbites | console.deepgram.com (free credit on sign-up) |
| `TMDB_API_KEY` | yes | star portraits for the face check, film stills, posters | themoviedb.org -> Settings -> API (free; use the short "API Key") |
| `GEMINI_API_KEY` | yes | vision check: right person, right decade, no logos or subtitles | aistudio.google.com -> Get API key (free tier) |
| `SERPER_API_KEY` | yes | Google video and image search | serper.dev (free credits on sign-up) |
| `YOUTUBE_API_KEY` | yes | YouTube search | console.cloud.google.com -> enable "YouTube Data API v3" -> Credentials -> API key (free quota) |
| `HUNT_PROXY` | optional | lets GitHub download from YouTube (talk-show soundbites) | a residential proxy network (Bright Data, Oxylabs, Decodo, IPRoyal, Webshare): the `http://user:pass@host:port` line from their dashboard. Not a desktop app. |

### 4. Allow GitHub to save footage
Your repo -> Settings -> Actions -> General -> Workflow permissions -> **Read and write permissions** -> Save.
Then open the **Actions** tab once and click the green button to enable workflows if GitHub asks.

### 5. Start Claude Code
```
cd D:\projects\archive-engine
claude
```
and paste the prompt Raheel gave you.

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
