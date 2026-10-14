import type { Team } from '@f1/shared';
import { model, Schema } from 'mongoose';

export type SeasonTeam = Team & { season: number };

const TeamSchema = new Schema<SeasonTeam>({
  season: { type: Number, required: true },
  teamId: { type: String, required: true },
  name: String,
  nationality: String,
  colour: { type: String, default: null },
});
TeamSchema.index({ season: 1, teamId: 1 }, { unique: true });

export const TeamModel = model<SeasonTeam>('Team', TeamSchema);
