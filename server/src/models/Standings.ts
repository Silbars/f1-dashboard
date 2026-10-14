import type { Standings } from '@f1/shared';
import { model, Schema } from 'mongoose';

const StandingSchema = new Schema<Standings>({
  season: { type: Number, required: true },
  afterRound: { type: Number, required: true },
  kind: { type: String, enum: ['driver', 'constructor'], required: true },
  entries: [
    new Schema(
      { position: Number, points: Number, wins: Number, id: String, name: String, code: String, teamId: String, teamName: String },
      { _id: false },
    ),
  ],
});
StandingSchema.index({ season: 1, kind: 1 }, { unique: true });

export const StandingsModel = model<Standings>('Standings', StandingSchema);
