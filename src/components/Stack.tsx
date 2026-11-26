import React from 'react';
import {AbsoluteFill, Img, OffthreadVideo, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import type {Box, Shot} from '../types';
import {Attribution} from './Attribution';

// How every visual sits in the 16:9 frame.
//  - Landscape footage (16:9-ish) fills the frame, punched in 104 % to lose broadcast logos and tape edges.
//  - 4:3 TV footage, portraits, scans and posters sit centred over a blurred, darkened copy of
//    themselves (no black bars), with a soft shadow.
//  - Photos never sit still: a slow push (100 -> 108 %) toward the face the hunter found, or a gentle drift.
//  - Print and pages: zoom in on the highlighted line while a yellow highlighter wipes across it.

const SHADOW = '0 18px 50px rgba(0,0,0,0.65)';
type Props = {shot: Shot; url: string; variant: number; durationInFrames: number; muted?: boolean};

export const Stack: React.FC<Props> = ({shot, url, variant, durationInFrames, muted = true}) => {
  const frame = useCurrentFrame();
  const {width, height, fps} = useVideoConfig();
  const isVideo = shot.kind === 'clip' || shot.kind === 'soundbite';
  const aspect = shot.w && shot.h ? shot.w / shot.h : 16 / 9;
  const p = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {extrapolateRight: 'clamp'});
  const ease = (x: number) => 1 - Math.pow(1 - x, 2);

  const clipDur = shot.dur ?? 5;
  const rate = isVideo && muted ? Math.max(0.8, Math.min(1, clipDur / (durationInFrames / fps))) : 1;

  const media = (style: React.CSSProperties) =>
    isVideo ? <OffthreadVideo src={url} muted={muted} playbackRate={rate} style={style} /> : <Img src={url} style={style} />;

  // ---------- full-frame footage
  if (isVideo && aspect >= 1.55)
    return (
      <AbsoluteFill style={{backgroundColor: '#000', overflow: 'hidden'}}>
        {media({width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.04 + 0.02 * p})`})}
        {shot.credit ? <Attribution text={shot.credit} /> : null}
      </AbsoluteFill>
    );

  // ---------- full-frame landscape photo: Ken Burns toward the face
  const focus = shot.focus ?? {x: 0.5, y: 0.42};
  if (shot.kind === 'photo' && aspect >= 1.55) {
    const s = interpolate(ease(p), [0, 1], [1.0, 1.08]);
    return (
      <AbsoluteFill style={{backgroundColor: '#000', overflow: 'hidden'}}>
        <Img src={url} style={{width: '100%', height: '100%', objectFit: 'cover', transformOrigin: `${focus.x * 100}% ${focus.y * 100}%`, transform: `scale(${s})`}} />
        {shot.credit ? <Attribution text={shot.credit} /> : null}
      </AbsoluteFill>
    );
  }

  // ---------- everything else sits in the stack
  const maxH = shot.kind === 'poster' ? 0.88 : 0.9;
  let fitH = height * maxH;
  let fitW = fitH * aspect;
  if (fitW > width * 0.9) { fitW = width * 0.9; fitH = fitW / aspect; }

  let transform = '';
  let origin = '50% 50%';
  let pageTransform = '';
  let pageOrigin = '50% 50%';
  const boxes: Box[] = shot.highlight ? (Array.isArray(shot.highlight) ? shot.highlight : [shot.highlight]) : [];
  if ((shot.kind === 'print' || shot.kind === 'page') && boxes.length) {
    // settle on the whole page, then push in until the highlighted line spans ~70 % of the screen
    const hb = boxes[0];
    const ox = (width - fitW) / 2 + (hb.x + hb.w / 2) * fitW;
    const oy = (height - fitH) / 2 + (hb.y + hb.h / 2) * fitH;
    const target = Math.max(1.4, Math.min(3.2, (0.7 * width) / Math.max(1, hb.w * fitW)));
    const z = interpolate(frame, [0.25 * fps, Math.min(durationInFrames - 1, 1.8 * fps)], [1, target], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: (x) => 1 - Math.pow(1 - x, 3)});
    // move the line toward the centre of the screen as we push in
    const k = (z - 1) / Math.max(0.001, target - 1);
    pageOrigin = `${ox}px ${oy}px`;
    pageTransform = `translate(${(width / 2 - ox) * k * 0.6}px, ${(height / 2 - oy) * k * 0.6}px) scale(${z})`;
  } else if (shot.kind === 'poster') {
    transform = `scale(${interpolate(p, [0, 1], [0.97, 1.02])})`;
  } else if (!isVideo) {
    origin = `${focus.x * 100}% ${focus.y * 100}%`;
    transform = variant % 4 === 3 ? `translateX(${interpolate(p, [0, 1], [-18, 18])}px) scale(1.02)` : `scale(${interpolate(ease(p), [0, 1], [1, 1.07])})`;
  } else {
    transform = `scale(${1 + 0.02 * p})`;
  }

  return (
    <AbsoluteFill style={{backgroundColor: '#000', overflow: 'hidden'}}>
      <AbsoluteFill style={{transform: 'scale(1.3)'}}>
        {media({width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(60px) brightness(0.5) saturate(0.8)'})}
      </AbsoluteFill>
      <AbsoluteFill style={{alignItems: 'center', justifyContent: 'center', transformOrigin: pageOrigin, transform: pageTransform}}>
        <div style={{position: 'relative', width: fitW, height: fitH, boxShadow: SHADOW, overflow: 'hidden', backgroundColor: '#111'}}>
          <div style={{position: 'absolute', inset: 0, transformOrigin: origin, transform}}>
            {media({width: '100%', height: '100%', objectFit: 'cover', transform: isVideo ? 'scale(1.04)' : undefined})}
            {boxes.map((b, i) => (
              <Highlighter key={i} box={b} delay={0.9 + (0.5 / boxes.length) * i} span={0.5 / boxes.length} />
            ))}
          </div>
        </div>
      </AbsoluteFill>
      {shot.credit ? <Attribution text={shot.credit} /> : null}
    </AbsoluteFill>
  );
};

// Yellow highlighter: multiply blend, 55 % opacity, left-to-right wipe.
const Highlighter: React.FC<{box: Box; delay: number; span: number}> = ({box, delay, span}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const start = delay * fps;
  const wipe = interpolate(frame, [start, start + Math.max(1, span * fps)], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: `${box.x * 100}%`, top: `${(box.y - box.h * 0.12) * 100}%`, width: `${box.w * 100 * wipe}%`,
      height: `${box.h * 124}%`, backgroundColor: '#FFE14D', mixBlendMode: 'multiply', opacity: 0.55, borderRadius: 3}} />
  );
};
