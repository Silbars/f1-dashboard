import type { Race } from '@f1/shared';
import { model, Schema } from 'mongoose';

const RaceSchema = new Schema<Race>({
  season: { type: Number, required: true },
  round: { type: Number, required: true },
  name: { type: String, required: true },
  circuit: {
    type: new Schema(
      { id: String, name: String, locality: String, country: String, lat: Number, long: Number },
      { _id: false },
    ),
    required: true,
  },
  sessions: [new Schema({ type: { type: String, required: true }, startsAt: { type: String, required: true } }, { _id: false })],
});
RaceSchema.index({ season: 1, round: 1 }, { unique: true });

export const RaceModel = model<Race>('Race', RaceSchema);
