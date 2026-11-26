import React from 'react';
import {Composition} from 'remotion';
import {Film} from './Film';
import {buildTimeline} from './timeline.mjs';
import type {Film as FilmT} from './types';

const placeholder: FilmT = {title: 'Preview', star: {name: 'Star'}, beats: [{seg: 'chapter', title: 'Pass a film with --props', year: 1968}]};

export const Root: React.FC = () => (
  <Composition
    id="Film"
    component={Film as unknown as React.FC<Record<string, unknown>>}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={300}
    defaultProps={{film: placeholder}}
    calculateMetadata={({props}) => {
      const film = (props as {film: FilmT}).film;
      const tl = buildTimeline(film);
      return {fps: tl.fps, durationInFrames: tl.frames};
    }}
  />
);
