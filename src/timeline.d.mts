export const DIP: number, CHAPTER: number, PAD: number, WPS: number, SOUNDBITE_PAD: number, QUOTE_HOLD: number,
  STAMP: number, LOWER: number, FOOTNOTE: number, SWELL: number, MAX_CLIP: number, MAX_STRETCH: number;
export function speechDur(beat: any): number;
export function wordTime(beat: any, w: number, dur: number): number;
export function buildTimeline(film: any): {
  fps: number; items: any[]; overlays: any[]; total: number; frames: number;
  audio: {
    vo: {file: string; start: number; bi: number}[];
    bites: {file: string; start: number; dur: number; bi: number}[];
    booms: number[]; whooshes: number[]; swells: [number, number][]; duck: [number, number][];
  };
};
