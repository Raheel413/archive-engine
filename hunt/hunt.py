#!/usr/bin/env python3
"""Archive hunter: finds footage, photos, print and soundbites for every shot in a film.

    python hunt/hunt.py films/<name> [--browser firefox] [--redo b05-0,b07-1] [--no-faces] [--only clip,photo]

For each shot without a `src` it:
  1. searches the archive sources the shot allows (SOURCES.md): YouTube, Internet Archive, Dailymotion,
     Vimeo / OK.ru / any site through Google, TMDB (portraits, film stills, posters), Wikimedia Commons,
     Google Images,
  2. downloads a window of the video with yt-dlp (or the image),
  3. finds clean camera shots (scene detection), and keeps the first one where the star's face
     matches the reference photos (face check), cut to 5 seconds or less, deinterlaced and scaled
     to 1080p, without audio,
  4. rejects frames with burned-in captions, news tickers or watermarks (OCR), AI fakes and
     reaction videos,
  5. soundbites: reads the video's subtitles (or transcribes it with Deepgram), finds the exact
     words the star says, and cuts those 5 seconds or less WITH audio,
  6. print: finds the words to highlight on a newspaper or magazine scan (OCR),
  7. writes src, credit, source, size and length into film.json and the list into credits.md.

Keys come from the environment or a .env file in the repo root:
  YOUTUBE_API_KEY, SERPER_API_KEY, TMDB_API_KEY (or TMDB_TOKEN), DEEPGRAM_API_KEY (soundbites without subtitles)
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import io
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote, urlparse

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import faces as facemod  # noqa: E402

MAX_CLIP = 5.0          # hard limit, seconds. Nothing longer ever leaves the hunter.
MIN_CLIP = 1.5
WINDOW = 45             # seconds of a long video searched for a clean shot of the star
MAX_TRIES = 7           # candidate videos tried per shot
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36"}
ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / ".hunt-cache"

CLIP_SOURCES = ["youtube", "archive", "dailymotion", "vimeo", "okru", "web"]
PHOTO_SOURCES = ["tmdb", "commons", "images"]
PRINT_SOURCES = ["images", "books"]
BITE_SOURCES = ["youtube", "archive", "dailymotion", "web"]

# Channels that hold real broadcast archives. A query is also tried with each of these names
# (YouTube's own search ranks the archive uploads first that way).
ARCHIVE_CHANNELS = ["AP Archive", "British Pathé", "Reuters Archive", "BBC Archive", "CBC Archives",
                    "Johnny Carson", "The Dick Cavett Show", "Parkinson", "Merv Griffin", "Thames TV", "Oscars"]
# words in a title that mean it is not real archive footage
JUNK = re.compile(r"\b(ai[- ]generated|ai art|deepfake|midjourney|recreat|reaction|reacts?|tribute edit|fan ?made|"
                  r"then (and|&) now|before and after|transformation|tiktok compilation|#shorts|lyrics)\b", re.I)


# ---------------------------------------------------------------- setup

KEYS = ("YOUTUBE_API_KEY", "SERPER_API_KEY", "TMDB_API_KEY", "TMDB_TOKEN", "DEEPGRAM_API_KEY", "HUNT_PROXY")


def load_env():
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            m = re.match(r"\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$", line)
            if m and not os.environ.get(m.group(1)):
                os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    # pasted keys often carry a stray space or newline: clean them all
    for k in KEYS:
        if os.environ.get(k):
            os.environ[k] = os.environ[k].strip().strip('"').strip("'").strip()


def log(*a):
    print(*a, flush=True)


def need(cmd):
    if not shutil.which(cmd):
        sys.exit(f"{cmd} is not installed or not on PATH")


def get_json(url, wiki=False, **kw):
    r = requests.get(url, headers=WIKI_UA if wiki else UA, timeout=25, **kw)
    r.raise_for_status()
    return r.json()


# ---------------------------------------------------------------- TMDB

class TMDB:
    base = "https://api.themoviedb.org/3"
    img = "https://image.tmdb.org/t/p/original"

    def __init__(self):
        self.key = os.environ.get("TMDB_API_KEY")
        self.token = os.environ.get("TMDB_TOKEN")
        self.ok = bool(self.key or self.token)

    def get(self, path, **params):
        if not self.ok:
            return {}
        h = dict(UA)
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        else:
            params["api_key"] = self.key
        try:
            r = requests.get(self.base + path, params=params, headers=h, timeout=25)
            r.raise_for_status()
            return r.json()
        except Exception as e:
            log(f"    tmdb {path} failed: {e}")
            return {}

    def person(self, name, tmdb_id=None):
        if tmdb_id:
            return tmdb_id
        res = self.get("/search/person", query=name).get("results", [])
        return res[0]["id"] if res else None

    def portraits(self, pid):
        return [self.img + p["file_path"] for p in self.get(f"/person/{pid}/images").get("profiles", [])]

    def tagged(self, pid):
        """Film stills and set photos tagged with the star."""
        out = []
        for p in self.get(f"/person/{pid}/tagged_images").get("results", []):
            m = p.get("media") or {}
            title = m.get("title") or m.get("name") or ""
            year = (m.get("release_date") or m.get("first_air_date") or "")[:4]
            out.append({"url": self.img + p["file_path"], "page": f"https://www.themoviedb.org/person/{pid}",
                        "credit": f"{title} ({year}) / TMDB" if title else "TMDB", "w": p.get("width"), "h": p.get("height"),
                        "year": int(year) if year.isdigit() else None, "film": title})
        return out

    def movie(self, title, year=None):
        params = {"query": title}
        if year:
            params["year"] = year
        res = self.get("/search/movie", **params).get("results", [])
        return res[0] if res else None

    def movie_images(self, title, year=None, kind="backdrops"):
        mv = self.movie(title, year)
        if not mv:
            return []
        imgs = self.get(f"/movie/{mv['id']}/images", include_image_language="en,null").get(kind, [])
        y = (mv.get("release_date") or "")[:4]
        return [{"url": self.img + i["file_path"], "page": f"https://www.themoviedb.org/movie/{mv['id']}",
                 "credit": f"{mv['title']} ({y}) / TMDB", "w": i.get("width"), "h": i.get("height")} for i in imgs]


# ---------------------------------------------------------------- search

def youtube_search(q, n=8, before=None):
    key = os.environ.get("YOUTUBE_API_KEY")
    if not key:
        return []
    try:
        r = requests.get("https://www.googleapis.com/youtube/v3/search",
                         params={"part": "snippet", "q": q, "type": "video", "maxResults": n, "key": key, "safeSearch": "none"},
                         timeout=20)
        r.raise_for_status()
        return [{"url": f"https://www.youtube.com/watch?v={i['id']['videoId']}", "title": i["snippet"]["title"],
                 "who": i["snippet"]["channelTitle"]} for i in r.json().get("items", [])]
    except Exception as e:
        log(f"    youtube search failed: {e}")
        return []


def serper(endpoint, q, n=10):
    key = os.environ.get("SERPER_API_KEY")
    if not key:
        return []
    try:
        r = requests.post(f"https://google.serper.dev/{endpoint}", headers={"X-API-KEY": key, "Content-Type": "application/json"},
                          json={"q": q, "num": n}, timeout=20)
        r.raise_for_status()
        return r.json().get(endpoint, [])
    except Exception as e:
        log(f"    serper {endpoint} failed: {e}")
        return []


def archive_search(q, n=8, mediatype="movies"):
    """Internet Archive: TV news, newsreels, home movies, old talk shows, trailers. Reachable from GitHub too."""
    try:
        j = get_json("https://archive.org/advancedsearch.php",
                     params={"q": f"({q}) AND mediatype:{mediatype}", "fl[]": ["identifier", "title", "creator", "year"],
                             "rows": n, "output": "json", "sort[]": "downloads desc"})
        return [{"url": f"https://archive.org/details/{d['identifier']}", "title": d.get("title", ""),
                 "who": (d.get("creator") if isinstance(d.get("creator"), str) else "Internet Archive") or "Internet Archive"}
                for d in j.get("response", {}).get("docs", [])]
    except Exception as e:
        log(f"    archive.org search failed: {e}")
        return []


def dailymotion_search(q, n=8):
    try:
        j = get_json("https://api.dailymotion.com/videos", params={"search": q, "fields": "url,title,owner.screenname,duration", "limit": n})
        return [{"url": v["url"], "title": v.get("title", ""), "who": v.get("owner.screenname", "")} for v in j.get("list", [])]
    except Exception as e:
        log(f"    dailymotion search failed: {e}")
        return []


def site_videos(q, site):
    return [{"url": v["link"], "title": v.get("title", ""), "who": ""} for v in serper("videos", f"{q} site:{site}") if site in v.get("link", "")]


YOUTUBE_BLOCKED = bool(os.environ.get("GITHUB_ACTIONS")) and not os.environ.get("HUNT_PROXY")


def video_candidates(q, sources, year=None, archive_first=True):
    if YOUTUBE_BLOCKED:
        sources = [s for s in sources if s != "youtube"]
    qy = f"{q} {year}" if year and str(year) not in q else q
    lists = []
    for s in sources:
        if s == "youtube":
            if archive_first:
                for ch in ARCHIVE_CHANNELS[:4]:
                    lists.append(youtube_search(f"{q} {ch}", n=4))
            lists.append(youtube_search(qy))
        elif s == "archive":
            lists.append(archive_search(q))
        elif s == "dailymotion":
            lists.append(dailymotion_search(qy))
        elif s == "vimeo":
            lists.append(site_videos(qy, "vimeo.com"))
        elif s == "okru":
            lists.append(site_videos(qy, "ok.ru"))
        elif s == "web":
            lists.append([{"url": v["link"], "title": v.get("title", ""), "who": ""} for v in serper("videos", qy) if v.get("link")])
    out, seen = [], set()
    for i in range(max((len(l) for l in lists), default=0)):
        for l in lists:
            if i < len(l) and l[i]["url"] not in seen and not JUNK.search(l[i].get("title", "")):
                seen.add(l[i]["url"])
                out.append(l[i])
    return out


WIKI_UA = {"User-Agent": "archive-engine/0.1 (https://github.com/Raheel413/archive-engine; documentary research)"}


def commons_search(q, n=8):
    try:
        j = get_json("https://commons.wikimedia.org/w/api.php",
                     params={"action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrsearch": q,
                             "gsrlimit": n, "prop": "imageinfo", "iiprop": "url|size|extmetadata", "iiurlwidth": 2400}, wiki=True)
        out = []
        for p in sorted(j.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0)):
            ii = (p.get("imageinfo") or [{}])[0]
            if not ii.get("thumburl") or not re.search(r"\.(jpe?g|png|webp|tiff?)$", ii.get("url", ""), re.I):
                continue
            meta = ii.get("extmetadata", {})
            artist = re.sub("<[^>]+>", "", meta.get("Artist", {}).get("value", "")).strip()
            lic = meta.get("LicenseShortName", {}).get("value", "")
            out.append({"url": ii["thumburl"], "page": ii.get("descriptionurl", ii["url"]),
                        "credit": " / ".join(x for x in [artist[:40], lic, "Wikimedia Commons"] if x),
                        "w": ii.get("thumbwidth"), "h": ii.get("thumbheight")})
        return out
    except Exception as e:
        log(f"    commons search failed: {e}")
        return []


def google_images(q, n=10):
    return [{"url": r["imageUrl"], "page": r.get("link", r["imageUrl"]), "credit": r.get("source") or urlparse(r.get("link", "")).netloc,
             "w": r.get("imageWidth"), "h": r.get("imageHeight")} for r in serper("images", q, n) if r.get("imageUrl")]


def shot_year(shot):
    y = shot.get("year")
    if y and str(y)[:4].isdigit():
        return int(str(y)[:4]) + (5 if str(y).endswith("s") else 0)
    m = re.search(r"\b(19[2-9]\d|20[0-2]\d)(s?)\b", shot.get("q", ""))
    return int(m.group(1)) + (5 if m.group(2) else 0) if m else None


ERA = [None, None]  # film.star.era, set in main()


def image_candidates(shot, star, tm, pid):
    q, sources, year = shot.get("q", ""), shot.get("from") or (PRINT_SOURCES if shot["kind"] == "print" else PHOTO_SOURCES), shot_year(shot)
    lists = []
    for s in sources:
        if s == "tmdb" and tm.ok:
            if shot.get("film"):
                lists.append(tm.movie_images(shot["film"], shot.get("year"), "posters" if shot["kind"] == "poster" else "backdrops"))
                if shot["kind"] == "photo" and pid and shot.get("star", True):  # stills of the star tagged with this film
                    lists.append([c for c in tm.tagged(pid) if c.get("film", "").lower() == shot["film"].lower()])
            elif shot["kind"] == "photo" and pid and shot.get("star", True):  # tagged stills are of the star only
                tagged = tm.tagged(pid)
                if year:  # only stills from around that year, closest first
                    tagged = [c for c in tagged if c.get("year") and abs(c["year"] - year) <= 6]
                    tagged.sort(key=lambda c: abs(c["year"] - year))
                elif ERA[0]:
                    tagged = [c for c in tagged if c.get("year") and ERA[0] - 2 <= c["year"] <= ERA[1] + 2]
                lists.append(tagged)
        elif s == "commons":
            lists.append(commons_search(q))
        elif s == "images":
            extra = {"print": " newspaper OR magazine page scan", "poster": " original poster"}.get(shot["kind"], "")
            lists.append(google_images(f"{q}{' ' + str(year) if year else ''}{extra}"))
        elif s == "books":  # LIFE and other magazines on Google Books, and magazine scans on archive.org
            lists.append(google_images(f"{q} site:books.google.com"))
            lists.append([{"url": f"https://archive.org/services/img/{d['url'].rsplit('/', 1)[-1]}", "page": d["url"], "credit": "Internet Archive"}
                          for d in archive_search(q, 6, "texts")])
    out, seen = [], set()
    for i in range(max((len(l) for l in lists), default=0)):
        for l in lists:
            if i < len(l) and l[i]["url"] not in seen:
                seen.add(l[i]["url"])
                out.append(l[i])
    return out


# ---------------------------------------------------------------- video helpers

def ydl_opts(args, out=None):
    o = {"quiet": True, "no_warnings": True, "noprogress": True, "noplaylist": True, "socket_timeout": 30, "retries": 2}
    if args.browser:
        o["cookiesfrombrowser"] = (args.browser,)
    if os.environ.get("HUNT_PROXY"):  # residential proxy: lets GitHub's machines download from YouTube
        o["proxy"] = os.environ["HUNT_PROXY"]
    cookies = os.environ.get("HUNT_COOKIES")
    if cookies and Path(cookies).exists():
        o["cookiefile"] = cookies
    if out:
        o["outtmpl"] = out
    return o


def site_name(info, fallback=""):
    ext = (info.get("extractor_key") or info.get("extractor") or "").replace(":", " ")
    who = info.get("uploader") or info.get("channel") or info.get("uploader_id") or fallback
    names = {"Youtube": "YouTube", "Dailymotion": "Dailymotion", "Vimeo": "Vimeo", "Archiveorg": "Internet Archive", "Odnoklassniki": "OK.ru"}
    site = names.get(ext, ext or urlparse(info.get("webpage_url", "")).netloc)
    return f"{who} / {site}" if who and who != site else site


def extract(url, args):
    import yt_dlp
    with yt_dlp.YoutubeDL(ydl_opts(args)) as y:
        info = y.extract_info(url, download=False)
    if info.get("_type") == "playlist":
        entries = [e for e in info.get("entries") or [] if e]
        if not entries:
            raise RuntimeError("empty playlist")
        info = entries[0]
    return info


def download(info, args, tag, a=None, b=None, audio=False):
    import yt_dlp
    from yt_dlp.utils import download_range_func
    opts = ydl_opts(args, str(CACHE / f"{tag}.%(ext)s"))
    # archive footage is often SD: take the best up to 1080p, never below 240p
    opts["format"] = ("bv*[height<=1080]+ba/b[height<=1080]/b" if audio else
                      "bv*[height<=1080][height>=360]/b[height<=1080][height>=360]/bv*[height<=1080]/b")
    if audio:
        opts["merge_output_format"] = "mp4"
    if a is not None:
        opts["download_ranges"] = download_range_func(None, [(a, b)])
        opts["force_keyframes_at_cuts"] = audio  # soundbites must start on the exact word
    for f in CACHE.glob(f"{tag}.*"):
        f.unlink()
    with yt_dlp.YoutubeDL(opts) as y:
        y.download([info.get("webpage_url") or info.get("original_url")])
    files = [f for f in CACHE.glob(f"{tag}.*") if f.suffix not in (".part", ".ytdl", ".vtt", ".json")]
    return files[0] if files else None


def probe(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "stream=width,height,field_order:format=duration", "-of", "json", str(path)], capture_output=True, text=True)
    j = json.loads(r.stdout or "{}")
    s = (j.get("streams") or [{}])[0]
    return s.get("width", 0), s.get("height", 0), float(j.get("format", {}).get("duration", 0) or 0), s.get("field_order", "progressive")


def segments(path, length):
    """Stretches between camera cuts as (start, dur), longest first."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", str(path), "-an", "-vf", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"],
                       capture_output=True, text=True)
    cuts = [float(m) for m in re.findall(r"pts_time:([\d.]+)", r.stderr)]
    marks = [0.0] + [c for c in cuts if 0 < c < length] + [length]
    segs = [(marks[i] + 0.12, marks[i + 1] - marks[i] - 0.24) for i in range(len(marks) - 1)]
    segs = [s for s in segs if s[1] >= MIN_CLIP]
    return sorted(segs, key=lambda s: -min(s[1], MAX_CLIP))


def frame(path, t, width=None):
    vf = f"scale={width}:-2" if width else "null"
    r = subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(path), "-frames:v", "1",
                        "-vf", vf, "-f", "image2", "-c:v", "png", "-"], capture_output=True)
    return r.stdout


def video_filter(w, h, interlaced):
    vf = []
    if interlaced or h in (480, 576):  # SD TV transfers are often interlaced: deinterlace safely either way
        vf.append("bwdif=mode=send_frame:deint=interlaced")
    vf.append("hqdn3d=1.5:1.5:4:4")  # light cleanup of tape noise; grain is added back evenly by the film look
    if h < 1080:
        vf.append("scale=-2:1080:flags=lanczos,unsharp=5:5:0.35")
    else:
        vf.append("scale=-2:'min(1080,ih)':flags=lanczos")
    vf += ["fps=30", "format=yuv420p"]
    return ",".join(vf)


def cut(src, start, dur, out, w, h, interlaced, audio_out=None):
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-i", str(src), "-t", f"{dur:.3f}",
                    "-an", "-vf", video_filter(w, h, interlaced), "-c:v", "libx264", "-preset", "medium", "-crf", "18",
                    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-movflags", "+faststart", str(out)], check=True)
    if audio_out:
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-i", str(src), "-t", f"{dur:.3f}",
                        "-vn", "-ac", "1", "-ar", "48000", str(audio_out)], check=True)


# ---------------------------------------------------------------- checks

def ocr_words(png_bytes):
    if not shutil.which("tesseract") or not png_bytes:
        return []
    CACHE.mkdir(exist_ok=True)
    p = CACHE / "_ocr.png"
    p.write_bytes(png_bytes)
    r = subprocess.run(["tesseract", str(p), "-", "--psm", "11", "tsv"], capture_output=True, text=True)
    out = []
    for line in r.stdout.splitlines()[1:]:
        c = line.split("\t")
        if len(c) >= 12:
            try:
                if float(c[10]) >= 70 and len(re.sub(r"[^A-Za-z0-9]", "", c[11])) >= 3:
                    out.append(c[11])
            except ValueError:
                pass
    return out


class Checker:
    def __init__(self, args, star_refs):
        self.args = args
        self.faces = None
        if not args.no_faces and facemod.available():
            try:
                self.faces = facemod.Faces()
                n = sum(self.faces.add_ref(facemod.load_bgr(b)) for b in star_refs)
                log(f"face check: {n} reference faces")
                if n == 0:
                    log("face check OFF: no usable reference photos (add TMDB_API_KEY or put photos in refs/)")
                    self.faces = None
            except Exception as e:
                log(f"face check OFF: {e}")
                self.faces = None
        else:
            log("face check OFF")

    def face(self, png):
        """(score, box) or (1.0, None) when the check is off."""
        if not self.faces or not png:
            return 1.0, None
        img = facemod.load_bgr(png)
        if img is None:
            return 0.0, None
        return self.faces.best(img)


# ---------------------------------------------------------------- clips

def hunt_clip(shot, sid, line, film_dir, used, args, chk, star):
    need_face = shot.get("star", True)
    if shot.get("url"):
        cands = [{"url": shot["url"], "title": "", "who": ""}]
    else:
        q = shot.get("q") or line
        cands = video_candidates(q, shot.get("from") or CLIP_SOURCES, shot_year(shot))
    tries = 0
    for c in cands:
        if c["url"] in used:
            continue
        if tries >= MAX_TRIES:
            break
        tries += 1
        log(f"    try {c['url']}  {c.get('title', '')[:60]}")
        try:
            info = extract(c["url"], args)
        except Exception as e:
            log(f"      skip: unavailable ({str(e).splitlines()[0][:100]})")
            continue
        if JUNK.search(info.get("title") or ""):
            log("      skip: not real archive (title)")
            continue
        dur = info.get("duration") or 0
        if dur and dur < MIN_CLIP:
            continue
        if shot.get("t") is not None:
            a = max(0, float(shot["t"]) - 1)
        elif dur > WINDOW + 20:
            frac = 0.12 + (int(hashlib.md5(sid.encode()).hexdigest(), 16) % 600) / 1000  # 0.12 .. 0.72, stable per shot
            a = dur * frac
        else:
            a = None
        try:
            path = download(info, args, f"{sid}-{tries}", a, (a + WINDOW) if a is not None else None)
        except Exception as e:
            log(f"      skip: download failed ({str(e).splitlines()[0][:100]})")
            continue
        if not path:
            continue
        w, h, length, fo = probe(path)
        if min(w, h) < 240 or length < MIN_CLIP:
            log(f"      skip: {w}x{h}, {length:.1f}s")
            continue
        picked = None
        for (s0, sd) in segments(path, length)[:8]:
            take = min(sd, MAX_CLIP)
            start = s0 + max(0, (sd - take) / 2)
            mid = frame(path, start + take / 2, 960)
            words = ocr_words(mid)
            if len(words) >= 3:
                log(f"      shot at {start:.1f}s: text on screen ({' '.join(words[:5])})")
                continue
            score, box = chk.face(mid) if need_face else (1.0, None)
            if need_face and score < facemod.MATCH:
                # one more look: faces turn; check the start of the shot too
                score2, box2 = chk.face(frame(path, start + 0.3, 960))
                if score2 > score:
                    score, box = score2, box2
            if need_face and score < facemod.MATCH:
                log(f"      shot at {start:.1f}s: not {star} (face {score:.2f})")
                continue
            picked = (start, take, float(score))
            break
        if not picked:
            continue
        start, take, score = picked
        out = film_dir / "assets" / f"{sid}.mp4"
        out.parent.mkdir(exist_ok=True)
        cut(path, start, take, out, w, h, fo not in ("progressive", "unknown"))
        w2, h2, d2, _ = probe(out)
        page = info.get("webpage_url") or c["url"]
        used.update([c["url"], page])
        t_src = (a or 0) + start
        shot.update({"src": f"assets/{sid}.mp4", "credit": site_name(info, c.get("who", "")), "source": page, "src_t": round(t_src, 1),
                     "w": w2, "h": h2, "dur": round(min(d2, MAX_CLIP), 2), **({"face": round(float(score), 2)} if need_face and chk.faces else {})})
        log(f"      got {take:.1f}s at {t_src:.1f}s of the source, {w}x{h} -> {w2}x{h2}  ({shot['credit']})")
        return True
    return False


# ---------------------------------------------------------------- soundbites

def vtt_words(vtt_text):
    """Word-level times from a YouTube auto-caption VTT (falls back to cue-level spreading)."""
    out = []
    ts = lambda s: sum(float(x) * m for x, m in zip(s.replace(",", ".").split(":")[::-1], (1, 60, 3600)))
    for block in re.split(r"\n\n+", vtt_text):
        m = re.search(r"(\d+:\d+:\d+[.,]\d+|\d+:\d+[.,]\d+) --> (\d+:\d+:\d+[.,]\d+|\d+:\d+[.,]\d+)", block)
        if not m:
            continue
        a, b = ts(m.group(1)), ts(m.group(2))
        body = block[m.end():].strip()
        if "<c>" in body or re.search(r"<\d+:\d+", body):
            # karaoke-style: <00:00:01.234><c> word</c>
            line = [l for l in body.splitlines() if "<" in l]
            if not line:
                continue
            t = a
            for tok in re.split(r"(<\d+:\d+:\d+[.,]\d+>)", line[-1]):
                mm = re.match(r"<(\d+:\d+:\d+[.,]\d+)>", tok)
                if mm:
                    t = ts(mm.group(1))
                    continue
                for w in re.sub(r"<[^>]+>", "", tok).split():
                    out.append((w, t))
        else:
            ws = re.sub(r"<[^>]+>", "", body).split()
            for i, w in enumerate(ws):
                out.append((w, a + (b - a) * i / max(1, len(ws))))
    # auto captions repeat lines: drop words that go back in time
    clean, last = [], -1
    for w, t in out:
        if t >= last:
            clean.append((w, t))
            last = t
    return clean


def deepgram_words(audio_path):
    key = os.environ.get("DEEPGRAM_API_KEY")
    if not key:
        return []
    with open(audio_path, "rb") as f:
        r = requests.post("https://api.deepgram.com/v1/listen?model=nova-3&language=en&punctuate=true",
                          headers={"Authorization": f"Token {key}", "Content-Type": "application/octet-stream"}, data=f, timeout=300)
    if not r.ok:
        log(f"      deepgram failed: {r.status_code}")
        return []
    ws = r.json()["results"]["channels"][0]["alternatives"][0]["words"]
    return [(w.get("punctuated_word") or w["word"], w["start"], w["end"]) for w in ws]


def norm(w):
    return re.sub(r"[^a-z0-9]", "", w.lower().replace("’", "").replace("'", ""))


def find_phrase(words, phrase):
    """Best match of `phrase` inside [(word, t[, end])]: (i, j, ratio)."""
    target = [norm(w) for w in phrase.split() if norm(w)]
    toks = [norm(w[0]) for w in words]
    n = len(target)
    best = (0, 0, 0.0)
    for i in range(len(toks)):
        for L in (n - 1, n, n + 1, n + 2):
            j = i + L
            if L < 1 or j > len(toks):
                continue
            r = difflib.SequenceMatcher(None, " ".join(toks[i:j]), " ".join(target)).ratio()
            if r > best[2]:
                best = (i, j, r)
    return best


def hunt_soundbite(shot, sid, line, film_dir, used, args, chk, star):
    phrase = shot.get("find") or ""
    if not phrase:
        log("    soundbite needs `find` (the words the star says)")
        return False
    if shot.get("url"):
        cands = [{"url": shot["url"], "title": "", "who": ""}]
    else:
        cands = video_candidates(f"{shot.get('q') or star + ' interview'} \"{' '.join(phrase.split()[:6])}\"", shot.get("from") or BITE_SOURCES,
                                 shot.get("year"), archive_first=False)
        cands += video_candidates(shot.get("q") or f"{star} interview", shot.get("from") or BITE_SOURCES, shot.get("year"))
    tries = 0
    for c in cands:
        if tries >= MAX_TRIES:
            break
        tries += 1
        log(f"    try {c['url']}  {c.get('title', '')[:60]}")
        try:
            info = extract(c["url"], args)
        except Exception as e:
            log(f"      skip: unavailable ({str(e).splitlines()[0][:100]})")
            continue
        dur = info.get("duration") or 0
        words = []
        # 1) captions
        subs = {**(info.get("automatic_captions") or {}), **(info.get("subtitles") or {})}
        lang = next((k for k in subs if k.startswith("en")), None)
        if lang:
            fmt = next((f for f in subs[lang] if f.get("ext") == "vtt"), None)
            if fmt:
                try:
                    words = [(w, t) for w, t in vtt_words(requests.get(fmt["url"], headers=UA, timeout=30).text)]
                except Exception:
                    words = []
        # 2) transcribe (short videos only)
        if not words and os.environ.get("DEEPGRAM_API_KEY") and 0 < dur <= 1800:
            try:
                a = download(info, args, f"{sid}-aud", audio=True)
                if a:
                    wav = CACHE / f"{sid}-aud.wav"
                    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(a), "-vn", "-ac", "1", "-ar", "16000", str(wav)], check=True)
                    words = [(w, s) for w, s, _ in deepgram_words(wav)]
            except Exception as e:
                log(f"      transcription failed: {str(e)[:100]}")
        if not words:
            log("      skip: no captions to search")
            continue
        i, j, ratio = find_phrase(words, phrase)
        if ratio < 0.78:
            log(f"      skip: words not found (best {ratio:.2f})")
            continue
        start = max(0, words[i][1] - 0.2)
        end = (words[j][1] if j < len(words) else words[j - 1][1] + 0.6) + 0.15
        take = min(MAX_CLIP, end - start)
        said = " ".join(w for w, t in words[i:j] if t < start + take - 0.1)
        if end - start > MAX_CLIP:
            log(f"      note: the line runs {end - start:.1f}s, kept the first {MAX_CLIP:.0f}s ({said})")
        key = f"{c['url']}@{int(start)}"
        if key in used:
            continue
        try:
            path = download(info, args, f"{sid}-sb", max(0, start - 2), start + take + 2, audio=True)
        except Exception as e:
            log(f"      skip: download failed ({str(e).splitlines()[0][:100]})")
            continue
        if not path:
            continue
        w, h, length, fo = probe(path)
        off = min(2.0, start)  # where the line starts inside the downloaded piece
        score, _ = chk.face(frame(path, off + take / 2, 960)) if shot.get("star", True) else (1.0, None)
        if shot.get("star", True) and score < facemod.MATCH:
            s2, _ = chk.face(frame(path, off + 0.4, 960))
            score = max(score, s2)
        if shot.get("star", True) and score < facemod.MATCH:
            log(f"      skip: {star} not on screen while speaking (face {score:.2f})")
            continue
        out = film_dir / "assets" / f"{sid}.mp4"
        aud = film_dir / "assets" / f"{sid}.wav"
        out.parent.mkdir(exist_ok=True)
        cut(path, off, take, out, w, h, fo not in ("progressive", "unknown"), audio_out=aud)
        w2, h2, d2, _ = probe(out)
        page = info.get("webpage_url") or c["url"]
        used.add(key)
        shot.update({"src": f"assets/{sid}.mp4", "audio": f"assets/{sid}.wav", "credit": site_name(info, c.get("who", "")), "source": page,
                     "src_t": round(start, 1), "w": w2, "h": h2, "dur": round(min(d2, MAX_CLIP), 2), "say": shot.get("say") or said})
        log(f"      got soundbite {take:.1f}s at {start:.1f}s: \"{said}\"  ({shot['credit']})")
        return True
    return False


# ---------------------------------------------------------------- images, print, posters

def fetch_image(url, page):
    from PIL import Image
    h = WIKI_UA if "wikimedia.org" in url else {**UA, "Referer": page}
    r = requests.get(url, headers=h, timeout=30)
    r.raise_for_status()
    img = Image.open(io.BytesIO(r.content))
    img.load()
    return img.convert("RGB")


def find_words_box(img, phrase):
    """Highlight boxes (fractions of the image) for `phrase` on a scan, one per text line, via OCR."""
    if not shutil.which("tesseract"):
        return None
    CACHE.mkdir(exist_ok=True)
    p = CACHE / "_scan.png"
    im = img if img.size[0] >= 1800 else img.resize((img.size[0] * 2, img.size[1] * 2))
    im.save(p)
    r = subprocess.run(["tesseract", str(p), "-", "--psm", "3", "tsv"], capture_output=True, text=True)
    rows = []
    for line in r.stdout.splitlines()[1:]:
        c = line.split("\t")
        if len(c) >= 12 and c[11].strip():
            rows.append((c[11], int(c[6]), int(c[7]), int(c[8]), int(c[9]), (c[2], c[3], c[4])))
    if not rows:
        return None
    i, j, ratio = find_phrase([(w[0], k) for k, w in enumerate(rows)], phrase)
    if ratio < 0.7:
        return None
    W, H = im.size
    lines = {}
    for w in rows[i:j]:
        lines.setdefault(w[5], []).append(w)
    boxes = []
    for ws in lines.values():
        x0 = min(w[1] for w in ws); y0 = min(w[2] for w in ws)
        x1 = max(w[1] + w[3] for w in ws); y1 = max(w[2] + w[4] for w in ws)
        boxes.append({"x": round(x0 / W, 4), "y": round(y0 / H, 4), "w": round((x1 - x0) / W, 4), "h": round((y1 - y0) / H, 4)})
    return boxes


def hunt_image(shot, sid, line, film_dir, used, args, chk, star, tm, pid):
    from PIL import Image
    kind = shot["kind"]
    need_face = shot.get("star", kind == "photo")
    if shot.get("url"):
        cands = [{"url": shot["url"], "page": shot["url"], "credit": urlparse(shot["url"]).netloc.replace("www.", "")}]
    else:
        cands = image_candidates(shot, star, tm, pid)
    tries = 0
    for c in cands:
        if c["url"] in used or c["page"] in used:
            continue
        if tries >= MAX_TRIES + 3:
            break
        tries += 1
        try:
            img = fetch_image(c["url"], c["page"])
        except Exception as e:
            log(f"    skip image ({str(e)[:80]})")
            continue
        w, h = img.size
        min_side = 700 if kind == "print" else 500
        if min(w, h) < min_side or not (0.3 <= w / h <= 3.2):
            log(f"    skip image {w}x{h}")
            continue
        if re.search(r"(alamy|shutterstock|gettyimages|istock|dreamstime|depositphotos|123rf)", c["url"] + c["page"], re.I):
            log("    skip image: stock site watermark")
            continue
        highlight, focus, score = None, None, None
        buf = io.BytesIO()
        img.save(buf, "PNG")
        if kind == "print":
            if shot.get("find"):
                highlight = find_words_box(img, shot["find"])
                if not highlight:
                    log("    skip scan: the words to highlight are not on it")
                    continue
        else:
            words = ocr_words(buf.getvalue()) if kind == "photo" else []
            if len(words) >= 8:
                log(f"    skip image: text-heavy ({' '.join(words[:6])})")
                continue
            if need_face:
                score, box = chk.face(buf.getvalue())
                if score < facemod.MATCH:
                    log(f"    skip image: not {star} (face {score:.2f})")
                    continue
                if box:
                    focus = {"x": round(float((box[0] + box[2] / 2) / w), 3), "y": round(float((box[1] + box[3] / 2) / h), 3)}
        img.thumbnail((2800, 2800), Image.LANCZOS)
        out = film_dir / "assets" / f"{sid}.jpg"
        out.parent.mkdir(exist_ok=True)
        img.save(out, "JPEG", quality=93)
        used.update([c["url"], c["page"]])
        shot.update({"src": f"assets/{sid}.jpg", "credit": c["credit"], "source": c["page"], "w": img.size[0], "h": img.size[1]})
        if highlight:
            shot["highlight"] = highlight
        if focus:
            shot["focus"] = focus
        if score is not None and chk.faces:
            shot["face"] = round(float(score), 2)
        log(f"    got {kind} {img.size[0]}x{img.size[1]}  ({c['credit']})")
        return True
    return False


# ---------------------------------------------------------------- main

def write_credits(film_dir, film, jobs):
    rows = ["# Credits", "", "Every archive source used in this video (paste the short list into the YouTube description).", "",
            "| Shot | Type | Credit | Source | At |", "|---|---|---|---|---|"]
    for sid, s, _ in jobs:
        if s.get("src"):
            rows.append(f"| {sid} | {s['kind']} | {s.get('credit', '')} | {s.get('source', '')} | {s.get('src_t', '')} |")
    (film_dir / "credits.md").write_text("\n".join(rows) + "\n", encoding="utf-8")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("film")
    ap.add_argument("--browser", default="", help="read login cookies from this browser (firefox recommended)")
    ap.add_argument("--redo", default="", help="comma-separated shot ids to hunt again, e.g. b05-0,b07-1")
    ap.add_argument("--only", default="", help="only these kinds, e.g. clip,soundbite")
    ap.add_argument("--no-faces", action="store_true", help="skip the face check")
    args = ap.parse_args()

    load_env()
    need("ffmpeg")
    need("ffprobe")
    film_dir = Path(args.film).resolve()
    film = json.loads((film_dir / "film.json").read_text(encoding="utf-8"))
    star = film["star"]["name"]
    if film["star"].get("era"):
        ERA[:] = film["star"]["era"]
    CACHE.mkdir(exist_ok=True)
    redo = {s.strip() for s in args.redo.split(",") if s.strip()}
    only = {s.strip() for s in args.only.split(",") if s.strip()}

    jobs = []
    for bi, b in enumerate(film["beats"]):
        for si, s in enumerate(b.get("shots") or []):
            if s["kind"] != "page":
                jobs.append((f"b{bi:02d}-{si}", s, b.get("text") or b.get("quote") or ""))

    rejected = film.setdefault("rejected", [])
    for sid, s, _ in jobs:
        if sid in redo and s.get("src"):
            if s.get("source"):
                rejected.append(s["source"])
            for k in ("src", "audio", "credit", "source", "w", "h", "dur", "focus", "face", "highlight", "src_t"):
                s.pop(k, None)
    used = {s.get("source") for _, s, _ in jobs if s.get("source") and s["kind"] != "soundbite"} | set(rejected)

    todo = [(sid, s, line) for sid, s, line in jobs if not s.get("src") and (not only or s["kind"] in only)]
    if not todo:
        log("nothing to hunt")
        write_credits(film_dir, film, jobs)
        return

    # reference faces: TMDB portraits + refs/ folder
    tm = TMDB()
    pid = tm.person(star, film["star"].get("tmdb")) if tm.ok else None
    if pid and not film["star"].get("tmdb"):
        film["star"]["tmdb"] = pid
    refs = []
    for f in sorted((film_dir / "refs").glob("*")) if (film_dir / "refs").exists() else []:
        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            refs.append(f.read_bytes())
    if pid:
        for u in tm.portraits(pid)[:12]:
            try:
                refs.append(requests.get(u, headers=UA, timeout=25).content)
            except Exception:
                pass
    chk = Checker(args, refs)

    found = 0
    path = film_dir / "film.json"
    for sid, s, line in todo:
        log(f"{sid} [{s['kind']}] {s.get('q') or s.get('film') or s.get('find') or s.get('url')}")
        try:
            if s["kind"] == "clip":
                ok = hunt_clip(s, sid, line, film_dir, used, args, chk, star)
            elif s["kind"] == "soundbite":
                ok = hunt_soundbite(s, sid, line, film_dir, used, args, chk, star)
            else:
                ok = hunt_image(s, sid, line, film_dir, used, args, chk, star, tm, pid)
        except Exception as e:
            log(f"    error: {e}")
            ok = False
        if ok:
            found += 1
            path.write_text(json.dumps(film, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")  # save as we go
        else:
            log("    NOT FOUND - try a different query, a `url`, or more sources in `from`")
    path.write_text(json.dumps(film, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    write_credits(film_dir, film, jobs)
    for f in CACHE.glob("*"):
        try:
            f.unlink()
        except Exception:
            pass
    log(f"\nfound {found}/{len(todo)}; still missing {len(todo) - found}")


if __name__ == "__main__":
    main()
