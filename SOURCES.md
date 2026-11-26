# Archive source map (1960s–1990s stars)

Where the hunter looks, in the order it trusts them, and how to point a shot at each one with `from`.
Rule for everything: **5 seconds or less per piece, credit on screen and in credits.md.**

## Moving footage (`kind: clip` and `soundbite`)

| `from` | What's there | Reachable from GitHub? | Notes |
|---|---|---|---|
| `youtube` | The deepest pool. The hunter tries each query with archive channel names first: **AP Archive, British Pathé, Reuters Archive, BBC Archive**, then plain search. Also talk-show channels (**Johnny Carson, The Dick Cavett Show, Parkinson, Merv Griffin**), **Oscars**, **Thames TV**, studio classic-trailer channels. | Usually blocked → laptop hunt | Talk shows are the best soundbite source: auto-captions let the hunter find the exact words. |
| `archive` | **Internet Archive** (archive.org): newsreels, old TV news, trailers, home movies, full talk-show episodes, public-domain films. | Yes | Free API, no key. Often SD: the hunter deinterlaces and scales to 1080p. |
| `dailymotion` | Old TV interviews and full shows re-uploaded from tape, a lot of 70s/80s European TV. | Yes | Free API, no key. |
| `vimeo` | Restored archive reels, film-school uploads, collectors. | Often | Found through Google (Serper). |
| `okru` | OK.ru: huge Russian/European re-upload hub; rare US talk shows and TV specials survive here. | Often | Found through Google (Serper). |
| `web` | Any page Google lists as a video (news sites, museum sites, Facebook pages). | Mixed | Last resort. |

Not used on purpose: Getty, Alamy, Shutterstock, Pond5 and other stock libraries (watermarked previews). Footage from AI "restorations", "reaction" videos, fan edits and "then and now" compilations is rejected by title.

## Stills (`kind: photo`, `poster`)

| `from` | What's there | Notes |
|---|---|---|
| `tmdb` | **The Movie Database**: portraits of the star at many ages (also the face-check references), film stills tagged with the star, backdrops, original posters. Set `film` + `year` on a shot to pull that movie's stills/poster. | Free key: themoviedb.org → Settings → API. Best single source for clean, big stills. |
| `commons` | **Wikimedia Commons**: press photos, publicity stills, studio portraits whose copyright lapsed (many pre-1978 US publicity photos). Credits come with the author and licence. | No key. |
| `images` | Google Images (Serper): magazine shoots, premiere photos, candid shots. Stock sites are filtered out. | Every photo must pass the face check. |

## Print (`kind: print`, `page`)

| Source | What's there | How |
|---|---|---|
| `books` | **LIFE magazine** (1936–1972) is fully scanned on Google Books; magazine scans on the Internet Archive (TV Guide, fan magazines). | `{"kind":"print","q":"Steve McQueen LIFE magazine 1966","find":"words to highlight"}` |
| `images` | Newspaper clippings and magazine pages people have scanned. | The hunter OCRs each scan and only keeps it if the `find` words are on it, then highlights them. |
| `page` + `url` | Any web page: an archive article (NYT TimesMachine pages, LA Times archive, obituaries, AFI Catalog, Variety archive). | Screenshot + highlight of `find`. Give the exact `url`. |
| Lantern (lantern.mediahist.org) | Fan and trade magazines, but only up to 1963. | Useful for early-60s stars only: give the scan as a `url`. |

## Manual sources worth knowing (paste a `url` into the shot)

- **UCLA Film & Television Archive** YouTube channel: Hearst Metrotone newsreels and KTLA news film.
- **British Pathé** and **AP Archive** websites: search there, then use the matching YouTube upload link.
- **NBC Universal Archives**, **CBS News archive**, **ABC News VideoSource**: preview clips online.
- **PBS American Masters** "Archive Interview Highlights".
- **Google News Archive** (news.google.com/newspapers): full scanned newspapers.
- **Reelin' in the Years** (Rona Barrett 70s/80s Hollywood interviews, David Frost): previews online.
