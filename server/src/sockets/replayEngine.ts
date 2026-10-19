import type { ReplayBoard, ReplaySample, ReplayState } from '@f1/shared';
import type { LoadedSession } from '../services/replay/store.ts';
import { boardAt } from '../services/replay/transform.ts';

export const TICK_MS = 250;
export const LOOKAHEAD_MS = 2000;
const SLOW_FETCH_MS = 300; // longer than this and the viewer sees "Buffering…"
const BOARD_MIN_GAP_MS = 1000; // the leaderboard is sent at most once a second

export type Speed = 1 | 2 | 4 | 8 | 16;
export type Emit = (event: string, payload: unknown) => void;
export type GetSamples = (from: number, to: number) => Promise<ReplaySample[]>;

/** One replay clock per viewer. The server decides "now"; the client only draws it. */
export class ReplayEngine {
  t = 0;
  playing = false;
  speed: Speed = 1;
  private session: LoadedSession;
  private emit: Emit;
  private getSamples: GetSamples;
  private now: () => number;
  private lastTick: number;
  private sentUntil: number;
  private lastEventT = 0;
  private lastBoard = '';
  private lastBoardAt = -Infinity;
  private epoch = 0; // bumped by seek so a fetch that was in flight is dropped
  private busy = false;

  constructor(session: LoadedSession, emit: Emit, getSamples: GetSamples, now: () => number = Date.now) {
    this.session = session;
    this.emit = emit;
    this.getSamples = getSamples;
    this.now = now;
    this.lastTick = now();
    this.sentUntil = -1000; // the first frames include t = 0
  }

  play() {
    this.advance();
    this.playing = true;
    this.emitState(false);
  }

  pause() {
    this.advance();
    this.playing = false;
    this.emitState(false);
  }

  setSpeed(x: Speed) {
    this.advance();
    this.speed = x;
    this.emitState(false);
  }

  seek(t: number) {
    const { durationMs } = this.session.summary;
    this.t = Number.isFinite(t) ? Math.min(Math.max(t, 0), durationMs) : 0;
    this.lastTick = this.now();
    this.sentUntil = this.t - 1000; // the client keeps one sample before t for interpolation
    this.lastEventT = this.t;
    this.lastBoard = '';
    this.lastBoardAt = -Infinity;
    this.epoch++;
    this.emitState(true);
  }

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.advance();
      const { durationMs } = this.session.summary;
      if (this.playing && this.t >= durationMs) {
        this.playing = false;
        this.emitState(false);
      }
      const to = Math.min(this.t + LOOKAHEAD_MS * this.speed, durationMs);
      if (to > this.sentUntil) {
        const epoch = this.epoch;
        const samples = await this.fetch(this.sentUntil, to);
        if (epoch === this.epoch) {
          this.sentUntil = to;
          if (samples.length > 0) this.emit('replay:frames', { samples });
        }
      }
      this.emitBoard();
      this.emitEvents();
    } finally {
      this.busy = false;
    }
  }

  /** Moves the clock forward by the wall time since the last call, while playing. */
  private advance() {
    const n = this.now();
    if (this.playing) this.t = Math.min(this.t + (n - this.lastTick) * this.speed, this.session.summary.durationMs);
    this.lastTick = n;
  }

  private async fetch(from: number, to: number): Promise<ReplaySample[]> {
    let buffering = false;
    const slow = setTimeout(() => {
      buffering = true;
      this.emit('replay:buffering', { on: true });
    }, SLOW_FETCH_MS);
    try {
      return await this.getSamples(from, to);
    } finally {
      clearTimeout(slow);
      if (buffering) this.emit('replay:buffering', { on: false });
    }
  }

  private emitState(reset: boolean) {
    const state: ReplayState = { playing: this.playing, speed: this.speed, t: this.t, reset };
    this.emit('replay:state', state);
  }

  private emitBoard() {
    const board: ReplayBoard = boardAt(this.session.data, this.t);
    const json = JSON.stringify([board.lap, board.rows]);
    if (json === this.lastBoard || this.now() - this.lastBoardAt < BOARD_MIN_GAP_MS) return;
    this.lastBoard = json;
    this.lastBoardAt = this.now();
    this.emit('replay:board', board);
  }

  private emitEvents() {
    for (const e of this.session.data.events) {
      if (e.t > this.lastEventT && e.t <= this.t) this.emit('replay:event', e);
    }
    this.lastEventT = this.t;
  }
}
