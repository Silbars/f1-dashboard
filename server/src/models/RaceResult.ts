import type { RaceResult } from '@f1/shared';
import { model, Schema } from 'mongoose';

const EntrySchema = new Schema(
  {
    position: Number,
    positionText: String,
    number: Number,
    driverId: { type: String, required: true },
    driverCode: String,
    driverName: String,
    teamId: { type: String, required: true },
    teamName: String,
    grid: Number,
    laps: Number,
    status: String,
    points: { type: Number, default: 0 },
    time: String,
    fastestLap: String,
    q1: String,
    q2: String,
    q3: String,
  },
  { _id: false },
);

const RaceResultSchema = new Schema<RaceResult>({
  season: { type: Number, required: true },
  round: { type: Number, required: true },
  type: { type: String, enum: ['race', 'sprint', 'qualifying'], required: true },
  raceName: { type: String, required: true },
  entries: [EntrySchema],
});
RaceResultSchema.index({ season: 1, round: 1, type: 1 }, { unique: true });

export const RaceResultModel = model<RaceResult>('RaceResult', RaceResultSchema);
