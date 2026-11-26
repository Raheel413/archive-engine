export type Box = {x: number; y: number; w: number; h: number};

export type Shot = {
  // clip      archive footage, 5 s or less, played muted under your narration
  // photo     a still (portrait, on-set photo, film still, premiere photo) - slow push toward the face
  // print     a scan of a newspaper or magazine page; `find` = words to highlight
  // page      a web page screenshot (an archive article, an obituary); `find` = words to highlight
  // poster    a film poster or magazine cover, centred, no crop
  // soundbite the star's own voice (only inside a soundbite beat), played with audio and subtitles
  kind: 'clip' | 'photo' | 'print' | 'page' | 'poster' | 'soundbite';
  q?: string;              // search query for the hunter
  from?: string[];         // where to look (see SOURCES.md): youtube, archive, dailymotion, vimeo, okru, web, tmdb, commons, images, books
  star?: boolean;          // true: the star's face must be in it (face check). Default: true for clip/photo/soundbite
  year?: number;           // roughly when it is from; the hunter prefers results from that year
  film?: string;           // a movie title: the hunter pulls stills/posters for it from TMDB
  at?: number;             // word index in the line where this shot starts
  url?: string;            // a direct link to use as-is (any site yt-dlp supports, an image, or a page)
  t?: number;              // with url on a video: start time in seconds to cut from
  find?: string;           // print/page: the words to highlight; soundbite: the words the star says
  say?: string;            // soundbite: subtitle text (defaults to `find`)
  // filled by the hunter / receipts script
  src?: string;            // file inside the film folder, e.g. assets/b03-0.mp4
  audio?: string;          // soundbite audio file
  credit?: string;         // shown bottom-left
  source?: string;         // page the asset came from (goes in credits.md)
  w?: number;
  h?: number;
  dur?: number;            // clip length in seconds (never above 5)
  focus?: {x: number; y: number}; // where the face is (0-1), photos push toward it
  face?: number;           // face-match score from the hunter
  highlight?: Box | Box[];
};

export type Beat = {
  seg: 'hook' | 'line' | 'outro' | 'chapter' | 'soundbite' | 'quote';
  text?: string;           // what you say (line, quote)
  title?: string;          // chapter title
  year?: number | string;  // chapter year, or a year stamp on a line
  shots?: Shot[];
  lower?: {name: string; role?: string}; // lower third on a line
  who?: string;            // soundbite / quote: who is speaking
  role?: string;
  quote?: string;          // quote card text
  by?: string;             // quote card attribution
  note?: string;           // italic footnote
  note_at?: number;
  // filled by align.mjs
  vo?: string;
  vo_dur?: number;
  words?: number[];        // start time of each word, seconds from the beat start
};

export type Film = {
  id?: string;
  title: string;
  fps?: number;
  star: {name: string; tmdb?: number; born?: number; era?: [number, number]; aka?: string[]};
  voice?: string;          // a Deepgram voice (aura-2-zeus-en ...) when there is no recording of your own
  look?: {grain?: number; vignette?: number};
  beats: Beat[];
};
