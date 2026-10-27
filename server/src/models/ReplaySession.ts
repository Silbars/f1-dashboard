import type { ReplayCorner, ReplayDriver, ReplaySessionType } from '@f1/shared';
import { model, Schema } from 'mongoose';

/** Looked up once per session, after ingest: turn positions, the pit lane trace and who retired. */
export interface StoredTrack {
  corners: ReplayCorner[];
  pitLane: [number, number][];
  dnf: number[]; // driver numbers
}

export interface ReplaySessionDoc {
  sessionKey: number;
  meetingKey: number;
  meetingName: string;
  countryName: string;
  sessionType: ReplaySessionType;
  startsAt: Date;
  durationMs: number;
  totalLaps: number;
  drivers: ReplayDriver[];
  outline: [number, number][];
  data: Buffer; // gzipped ReplayData: laps, positions, intervals, stints and race-control events
  complete: boolean; // true once every minute chunk is stored
  track?: StoredTrack; // absent until first looked up
}

const ReplaySessionSchema = new Schema<ReplaySessionDoc>({
  sessionKey: { type: Number, required: true, unique: true },
  meetingKey: { type: Number, required: true, index: true },
  meetingName: { type: String, required: true },
  countryName: { type: String, required: true },
  sessionType: { type: String, required: true },
  startsAt: { type: Date, required: true },
  durationMs: { type: Number, required: true },
  totalLaps: { type: Number, required: true },
  drivers: { type: Schema.Types.Mixed, required: true },
  outline: { type: Schema.Types.Mixed, required: true },
  data: { type: Buffer, required: true },
  complete: { type: Boolean, default: false },
  track: { type: Schema.Types.Mixed },
});

export const ReplaySessionModel = model<ReplaySessionDoc>('ReplaySession', ReplaySessionSchema);
