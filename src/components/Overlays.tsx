import React from 'react';
import {AbsoluteFill, Img, interpolate, random, useCurrentFrame, useVideoConfig} from 'remotion';

const SERIF = '"Playfair Display", Georgia, serif';
const SANS = 'Inter, "Helvetica Neue", Arial, sans-serif';

const fade = (frame: number, dur: number, fps: number, inS = 0.35, outS = 0.35) =>
  interpolate(frame, [0, inS * fps, dur - outS * fps, dur], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

// Chapter card: black, the year small and spaced above a big serif title. Slow push, fades in and out.
export const ChapterCard: React.FC<{title: string; year?: string | number; durationInFrames: number; bg?: string}> = ({title, year, durationInFrames, bg}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const o = fade(frame, durationInFrames, fps, 0.5, 0.5);
  const s = interpolate(frame, [0, durationInFrames], [1, 1.04]);
  const line = interpolate(frame, [0.4 * fps, 1.2 * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor: '#000', alignItems: 'center', justifyContent: 'center'}}>
      {bg ? <Img src={bg} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.22 * o, filter: 'grayscale(1) blur(2px)', transform: `scale(${s * 1.05})`}} /> : null}
      <div style={{opacity: o, transform: `scale(${s})`, textAlign: 'center', color: '#f3efe6'}}>
        {year ? <div style={{fontFamily: SANS, fontSize: 34, letterSpacing: 18, fontWeight: 500, opacity: 0.75, marginBottom: 18}}>{year}</div> : null}
        <div style={{width: 120 * line, height: 2, background: '#c9a86a', margin: '0 auto 26px'}} />
        <div style={{fontFamily: SERIF, fontSize: 104, fontWeight: 700, lineHeight: 1.05, maxWidth: 1500}}>{title}</div>
      </div>
    </AbsoluteFill>
  );
};

// Year stamp: top-left, small caps sans, thin gold rule. Places the viewer in time.
export const YearStamp: React.FC<{text: string; durationInFrames: number}> = ({text, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const o = fade(frame, durationInFrames, fps);
  const x = interpolate(frame, [0, 0.4 * fps], [-14, 0], {extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 72, top: 64, opacity: o, transform: `translateX(${x}px)`, display: 'flex', alignItems: 'center', gap: 16}}>
      <div style={{width: 3, height: 44, background: '#c9a86a'}} />
      <div style={{fontFamily: SANS, fontWeight: 600, fontSize: 40, letterSpacing: 6, color: '#fff', textShadow: '0 2px 14px rgba(0,0,0,0.8)'}}>{text}</div>
    </div>
  );
};

// Lower third: name in serif, role in small spaced sans, bottom-left above the credit line.
export const LowerThird: React.FC<{name: string; role?: string; durationInFrames: number; high?: boolean}> = ({name, role, durationInFrames, high}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const o = fade(frame, durationInFrames, fps);
  const w = interpolate(frame, [0, 0.5 * fps], [0, 1], {extrapolateRight: 'clamp', easing: (x) => 1 - Math.pow(1 - x, 3)});
  return (
    <div style={{position: 'absolute', left: 80, bottom: high ? 190 : 120, opacity: o}}>
      <div style={{fontFamily: SERIF, fontSize: 52, fontWeight: 700, color: '#fff', textShadow: '0 2px 16px rgba(0,0,0,0.85)'}}>{name}</div>
      <div style={{width: 340 * w, height: 2, background: '#c9a86a', margin: '10px 0'}} />
      {role ? <div style={{fontFamily: SANS, fontSize: 24, letterSpacing: 4, textTransform: 'uppercase', color: '#e9e4d8', textShadow: '0 2px 10px rgba(0,0,0,0.9)'}}>{role}</div> : null}
    </div>
  );
};

// Subtitles for a soundbite: the words appear in step, white on a soft shadow, bottom centre.
export const Subtitle: React.FC<{text: string; durationInFrames: number}> = ({text, durationInFrames}) => {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  const shown = Math.ceil(interpolate(frame, [0, durationInFrames * 0.85], [1, words.length], {extrapolateRight: 'clamp'}));
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 78, textAlign: 'center'}}>
      <span style={{fontFamily: SANS, fontWeight: 600, fontSize: 46, lineHeight: 1.3, color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '6px 18px', borderRadius: 6, boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone'}}>
        {words.slice(0, shown).join(' ')}
        <span style={{opacity: 0}}>{' ' + words.slice(shown).join(' ')}</span>
      </span>
    </div>
  );
};

// Quote card: aged paper, the quote in serif italic, attribution under it. Words fade in one by one.
export const QuoteCard: React.FC<{quote: string; by?: string; durationInFrames: number; bg?: string}> = ({quote, by, durationInFrames, bg}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = quote.split(/\s+/);
  const per = Math.max(1, Math.min(0.12 * fps, (durationInFrames * 0.6) / words.length));
  const o = fade(frame, durationInFrames, fps, 0.4, 0.4);
  return (
    <AbsoluteFill style={{backgroundColor: '#0c0b09', alignItems: 'center', justifyContent: 'center', opacity: o}}>
      {bg ? <Img src={bg} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, filter: 'grayscale(1) blur(6px)'}} /> : null}
      <div style={{maxWidth: 1380, textAlign: 'center', padding: 40}}>
        <div style={{fontFamily: SERIF, fontSize: 150, lineHeight: 0.6, color: '#c9a86a', opacity: 0.8}}>&ldquo;</div>
        <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: words.length > 30 ? 52 : 64, lineHeight: 1.35, color: '#f3efe6'}}>
          {words.map((w, i) => (
            <span key={i} style={{opacity: interpolate(frame, [i * per, i * per + 0.3 * fps], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}}>{w} </span>
          ))}
        </div>
        {by ? <div style={{fontFamily: SANS, fontSize: 28, letterSpacing: 5, textTransform: 'uppercase', color: '#c9a86a', marginTop: 34}}>&mdash; {by}</div> : null}
      </div>
    </AbsoluteFill>
  );
};

// The film look over everything: fine animated grain and a soft vignette, so footage from 1962
// and 1994 feels like one film. Strength comes from film.look.
export const FilmLook: React.FC<{grain?: number; vignette?: number}> = ({grain = 0.06, vignette = 0.45}) => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2);
  const ox = Math.floor(random(`gx${seed}`) * 200);
  const oy = Math.floor(random(`gy${seed}`) * 200);
  const noise = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='${seed % 50}'/><feColorMatrix values='0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 1 0'/></filter><rect width='256' height='256' filter='url(%23n)'/></svg>")`;
  return (
    <AbsoluteFill style={{pointerEvents: 'none'}}>
      {grain > 0 ? <AbsoluteFill style={{backgroundImage: noise, backgroundPosition: `${ox}px ${oy}px`, opacity: grain, mixBlendMode: 'overlay'}} /> : null}
      {vignette > 0 ? <AbsoluteFill style={{background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,${vignette}) 100%)`}} /> : null}
    </AbsoluteFill>
  );
};
