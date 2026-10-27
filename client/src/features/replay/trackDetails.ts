import type { ReplayTrack } from '@f1/shared';
import { pathMarks } from '../../lib/replay';

type Fit = (x: number, y: number) => [number, number];
type Pt = [number, number];

const TEXT = '#a1a1aa';
const HALO = '#09090b';
const ARROW_SPACING = 110;
const LABEL_GAP = 22;

const nearestTrack = (track: Pt[], x: number, y: number) => Math.min(...track.map(([a, b]) => Math.hypot(a - x, b - y)));

/** The side (+1 or -1) of a point's normal that lies farther from the track, so a label stays off the tarmac. */
function clearerSide(track: Pt[], x: number, y: number, nx: number, ny: number): 1 | -1 {
  return nearestTrack(track, x + nx * LABEL_GAP, y + ny * LABEL_GAP) >= nearestTrack(track, x - nx * LABEL_GAP, y - ny * LABEL_GAP) ? 1 : -1;
}

function label(o: CanvasRenderingContext2D, text: string, x: number, y: number) {
  o.font = '600 10px system-ui, sans-serif';
  o.textAlign = 'center';
  o.textBaseline = 'middle';
  o.lineWidth = 3;
  o.strokeStyle = HALO;
  o.strokeText(text, x, y);
  o.fillStyle = TEXT;
  o.fillText(text, x, y);
}

/** Direction of travel: chevrons along the lap, which the outline is recorded in. */
function drawArrows(o: CanvasRenderingContext2D, track: Pt[]) {
  const [sx, sy] = track[0]!;
  o.fillStyle = TEXT;
  for (const m of pathMarks(track, ARROW_SPACING)) {
    if (Math.hypot(m.x - sx, m.y - sy) < 24) continue; // the start line has its own marker
    o.save();
    o.translate(m.x, m.y);
    o.rotate(m.angle);
    o.beginPath();
    o.moveTo(5, 0);
    o.lineTo(-3.5, -4);
    o.lineTo(-1.5, 0);
    o.lineTo(-3.5, 4);
    o.closePath();
    o.fill();
    o.restore();
  }
}

/** The outline starts where the fastest lap began, which is the start/finish line. */
function drawStartLine(o: CanvasRenderingContext2D, track: Pt[]) {
  const [x, y] = track[0]!;
  const [hx, hy] = track[Math.min(4, track.length - 1)]!;
  const heading = Math.atan2(hy - y, hx - x);
  const SQUARE = 3.5;
  const ROWS = 6;
  o.save();
  o.translate(x, y);
  o.rotate(heading);
  for (let i = 0; i < ROWS; i++) {
    for (let j = 0; j < 2; j++) {
      o.fillStyle = (i + j) % 2 ? '#fafafa' : '#18181b';
      o.fillRect((j - 1) * SQUARE, (i - ROWS / 2) * SQUARE, SQUARE, SQUARE);
    }
  }
  o.strokeStyle = '#71717a';
  o.lineWidth = 0.75;
  o.strokeRect(-SQUARE, (-ROWS / 2) * SQUARE, 2 * SQUARE, ROWS * SQUARE);
  o.restore();
  const nx = -Math.sin(heading);
  const ny = Math.cos(heading);
  const side = clearerSide(track, x, y, nx, ny);
  label(o, 'Start / finish', x + nx * side * (LABEL_GAP + 18), y + ny * side * (LABEL_GAP + 18));
}

function drawPitLane(o: CanvasRenderingContext2D, track: Pt[], lane: Pt[]) {
  if (lane.length < 2) return;
  o.strokeStyle = '#d4d4d8';
  o.globalAlpha = 0.85;
  o.lineWidth = 2;
  o.lineCap = 'round';
  o.lineJoin = 'round';
  o.beginPath();
  lane.forEach(([x, y], i) => (i === 0 ? o.moveTo(x, y) : o.lineTo(x, y)));
  o.stroke();
  o.globalAlpha = 1;
  const mid = lane[Math.floor(lane.length / 2)]!;
  const a = lane[Math.max(0, Math.floor(lane.length / 2) - 1)]!;
  const b = lane[Math.min(lane.length - 1, Math.floor(lane.length / 2) + 1)]!;
  const heading = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const nx = -Math.sin(heading);
  const ny = Math.cos(heading);
  const side = clearerSide(track, mid[0], mid[1], nx, ny);
  label(o, 'Pit lane', mid[0] + nx * side * 16, mid[1] + ny * side * 16);
}

/** Turn number in a ring, placed in the direction the circuit data gives for it (the offset is in raw, y-up units). */
function drawCorners(o: CanvasRenderingContext2D, fit: Fit, corners: ReplayTrack['corners']) {
  for (const c of corners) {
    const [cx, cy] = fit(c.x, c.y);
    const r = (c.angle * Math.PI) / 180;
    const [ux, uy] = fit(c.x + Math.cos(r), c.y + Math.sin(r));
    const len = Math.hypot(ux - cx, uy - cy) || 1;
    const lx = cx + ((ux - cx) / len) * 19;
    const ly = cy + ((uy - cy) / len) * 19;
    o.beginPath();
    o.arc(lx, ly, 8.5, 0, Math.PI * 2);
    o.fillStyle = HALO;
    o.fill();
    o.lineWidth = 1;
    o.strokeStyle = '#71717a';
    o.stroke();
    o.font = '600 10px system-ui, sans-serif';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillStyle = '#e4e4e7';
    o.fillText(String(c.number), lx, ly + 0.5);
  }
}

/** Everything static on the map besides the racing line: pit lane, direction, start line and turn numbers. */
export function drawTrackDetails(o: CanvasRenderingContext2D, fit: Fit, outline: Pt[], track: ReplayTrack | null) {
  if (outline.length < 2) return;
  const line = outline.map(([x, y]) => fit(x, y));
  if (track) drawPitLane(o, line, track.pitLane.map(([x, y]) => fit(x, y)));
  drawArrows(o, line);
  drawStartLine(o, line);
  if (track) drawCorners(o, fit, track.corners);
}
