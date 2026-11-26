import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';

// Caveat note: italic sans-serif, top-right (the year stamp owns top-left), fades in and out.
export const Footnote: React.FC<{text: string; durationInFrames: number}> = ({text, durationInFrames}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const f = 0.25 * fps;
  const opacity = interpolate(frame, [0, f, durationInFrames - f, durationInFrames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        right: 64,
        top: 60,
        textAlign: 'right',
        opacity,
        fontFamily: 'Arial, Helvetica, "Liberation Sans", sans-serif',
        fontStyle: 'italic',
        fontSize: 34,
        color: '#fff',
        textShadow: '0 2px 10px rgba(0,0,0,0.85)',
        maxWidth: 900,
      }}
    >
      {text}
    </div>
  );
};
