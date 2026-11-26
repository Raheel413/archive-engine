import React, {useEffect, useState} from 'react';
import {AbsoluteFill, Sequence, continueRender, delayRender, staticFile} from 'remotion';
import '@fontsource/playfair-display/700.css';
import '@fontsource/playfair-display/700-italic.css';
import '@fontsource/playfair-display/400-italic.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import {buildTimeline} from './timeline.mjs';
import type {Film as FilmT} from './types';
import {Stack} from './components/Stack';
import {ChapterCard, FilmLook, LowerThird, QuoteCard, Subtitle, YearStamp} from './components/Overlays';
import {Footnote} from './components/Footnote';
import {Missing} from './components/Missing';

export const Film: React.FC<{film: FilmT}> = ({film}) => {
  const [handle] = useState(() => delayRender('fonts'));
  useEffect(() => {
    document.fonts.ready.then(() => continueRender(handle));
  }, [handle]);

  const tl = buildTimeline(film);
  const fps = tl.fps;
  const id = film.id ?? 'sample';
  const url = (src: string) => staticFile(`films/${id}/${src}`);
  const frames = (from: number, dur: number) => {
    const a = Math.round(from * fps);
    return {from: a, durationInFrames: Math.max(1, Math.round((from + dur) * fps) - a)};
  };
  // a still for chapter and quote backgrounds: the first photo after that beat
  const nextStill = (bi: number) => {
    for (let k = bi + 1; k < film.beats.length; k++)
      for (const s of film.beats[k].shots ?? []) if (s.src && (s.kind === 'photo' || s.kind === 'poster')) return url(s.src);
    return undefined;
  };

  return (
    <AbsoluteFill style={{backgroundColor: '#000'}}>
      {tl.items.map((it: any, i: number) => {
        const f = frames(it.from, it.dur);
        let body: React.ReactNode = null;
        if (it.type === 'dip') body = <AbsoluteFill style={{backgroundColor: '#000'}} />;
        else if (it.type === 'chapter') body = <ChapterCard title={it.beat.title} year={it.beat.year} durationInFrames={f.durationInFrames} bg={nextStill(it.bi)} />;
        else if (it.type === 'quote') body = <QuoteCard quote={it.beat.quote ?? it.beat.text} by={it.beat.by ?? it.beat.who} durationInFrames={f.durationInFrames} bg={nextStill(it.bi)} />;
        else if (it.type === 'soundbite')
          body = it.shot.src ? (
            <AbsoluteFill>
              <Stack shot={it.shot} url={url(it.shot.src)} variant={i} durationInFrames={f.durationInFrames} />
              <Subtitle text={it.shot.say ?? it.shot.find ?? ''} durationInFrames={f.durationInFrames} />
            </AbsoluteFill>
          ) : (
            <Missing label={`soundbite: ${it.shot.find ?? it.shot.q ?? ''}`} />
          );
        else if (it.type === 'shot')
          body = it.shot.src ? (
            <Stack shot={it.shot} url={url(it.shot.src)} variant={i} durationInFrames={f.durationInFrames} />
          ) : (
            <Missing label={`${it.shot.kind}: ${it.shot.q ?? it.shot.film ?? it.shot.url ?? ''}`} />
          );
        return (
          <Sequence key={i} {...f} name={`${it.type} ${it.bi ?? ''}`}>
            {body}
          </Sequence>
        );
      })}
      <FilmLook grain={film.look?.grain} vignette={film.look?.vignette} />
      {tl.overlays.map((o: any, i: number) => {
        const f = frames(o.from, o.dur);
        const el =
          o.type === 'stamp' ? <YearStamp text={o.text} durationInFrames={f.durationInFrames} /> :
          o.type === 'lower' ? <LowerThird name={o.name} role={o.role} high={o.high} durationInFrames={f.durationInFrames} /> :
          <Footnote text={o.text} durationInFrames={f.durationInFrames} />;
        return (
          <Sequence key={`o${i}`} {...f} name={o.type}>
            {el}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
