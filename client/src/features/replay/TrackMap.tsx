import type { ReplayMeta, ReplaySample, ReplayTrack } from '@f1/shared';
import { type MutableRefObject, useEffect, useRef } from 'react';
import { clockAt, fitToCanvas, parkedAt, positionAt, pruneBefore, retiredHidden } from '../../lib/replay';
import { drawTrackDetails } from './trackDetails';
import type { LiveState } from './useReplay';

interface Props {
  meta: ReplayMeta;
  buffer: MutableRefObject<Map<number, ReplaySample[]>>;
  state: LiveState | null;
  selected: number | null;
  track: ReplayTrack | null;
  hideRetired: boolean;
}

const DOT_RADIUS = 6;

/** Draws the outline once per resize; each animation frame draws one dot per car at the replay time. */
export function TrackMap({ meta, buffer, state, selected, track, hideRetired }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const selectedRef = useRef(selected);
  const hideRef = useRef(hideRetired);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  useEffect(() => {
    hideRef.current = hideRetired;
  }, [hideRetired]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const outline = document.createElement('canvas');
    const duration = meta.session.durationMs;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let fit = fitToCanvas(meta.outline, 1, 1);
    let lastPrune = 0;
    let raf = 0;
    // Retired cars (driver number to the time their last lap began) and which of them are off the map right now.
    const retiredFrom = new Map(track?.retired ?? []);
    const wasGone = new Map<number, boolean>();
    const gone = new Set<number>();

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = window.devicePixelRatio || 1;
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      outline.width = canvas.width;
      outline.height = canvas.height;
      fit = fitToCanvas(meta.outline, w, h);
      const o = outline.getContext('2d')!;
      o.setTransform(dpr, 0, 0, dpr, 0, 0);
      o.strokeStyle = '#52525b';
      o.lineWidth = 3;
      o.lineJoin = 'round';
      o.beginPath();
      meta.outline.forEach(([x, y], i) => {
        const [px, py] = fit(x, y);
        if (i === 0) o.moveTo(px, py);
        else o.lineTo(px, py);
      });
      o.closePath();
      o.stroke();
      drawTrackDetails(o, fit, meta.outline, track);
    };

    const frame = (now: number) => {
      // Before the first layout (or while hidden) the canvases are 0 px square; drawImage would throw.
      if (outline.width === 0 || outline.height === 0) {
        raf = requestAnimationFrame(frame);
        return;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(outline, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const s = stateRef.current;
      if (s) {
        const t = clockAt(s, performance.now(), duration);
        gone.clear();
        if (hideRef.current) {
          for (const [n, from] of retiredFrom) {
            const othersHaveData = () => meta.drivers.some((d) => !retiredFrom.has(d.n) && parkedAt(buffer.current.get(d.n) ?? [], t) !== null);
            const away = retiredHidden(wasGone.get(n) ?? false, t, from, parkedAt(buffer.current.get(n) ?? [], t), othersHaveData);
            wasGone.set(n, away);
            if (away) gone.add(n);
          }
        }
        const followed = selectedRef.current;
        const trail = followed === null || gone.has(followed) ? undefined : buffer.current.get(followed);
        if (trail && trail.length > 1) {
          // The buffer holds about 5 s either side of the replay time; draw the part behind it.
          ctx.beginPath();
          let started = false;
          for (const [, st, sx, sy] of trail) {
            if (st > t) break;
            const [px, py] = fit(sx, sy);
            if (started) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
            started = true;
          }
          ctx.strokeStyle = meta.drivers.find((d) => d.n === followed)?.colour ?? '#ffffff';
          ctx.globalAlpha = 0.8;
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        for (const d of meta.drivers) {
          if (gone.has(d.n)) continue;
          const p = positionAt(buffer.current.get(d.n) ?? [], t);
          if (!p) continue;
          const [px, py] = fit(p[0], p[1]);
          ctx.beginPath();
          ctx.arc(px, py, DOT_RADIUS, 0, Math.PI * 2);
          ctx.fillStyle = d.colour;
          ctx.fill();
          if (d.n === selectedRef.current) {
            ctx.beginPath();
            ctx.arc(px, py, DOT_RADIUS + 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.font = '600 10px system-ui, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(d.code, px + DOT_RADIUS + 3, py + 3);
        }
        if (now - lastPrune > 1000) {
          pruneBefore(buffer.current, t);
          lastPrune = now;
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(layout);
    ro.observe(canvas);
    layout();
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [meta, buffer, track]);

  return <canvas ref={canvasRef} role="img" aria-label="Track map: positions of all cars, with turn numbers, pit lane, start line and direction of travel" className="block h-full w-full" />;
}
