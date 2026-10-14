import type { Driver } from '@f1/shared';
import { model, Schema } from 'mongoose';

export type SeasonDriver = Driver & { season: number };

const DriverSchema = new Schema<SeasonDriver>({
  season: { type: Number, required: true },
  driverId: { type: String, required: true },
  code: String,
  number: Number,
  givenName: String,
  familyName: String,
  nationality: String,
  dateOfBirth: String,
});
DriverSchema.index({ season: 1, driverId: 1 }, { unique: true });

export const DriverModel = model<SeasonDriver>('Driver', DriverSchema);
