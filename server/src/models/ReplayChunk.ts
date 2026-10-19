import { model, Schema } from 'mongoose';

export interface ReplayChunkDoc {
  sessionKey: number;
  minute: number; // covers t in [minute·60000, (minute+1)·60000)
  data: Buffer; // gzipped ReplaySample[]
}

const ReplayChunkSchema = new Schema<ReplayChunkDoc>({
  sessionKey: { type: Number, required: true },
  minute: { type: Number, required: true },
  data: { type: Buffer, required: true },
});
ReplayChunkSchema.index({ sessionKey: 1, minute: 1 }, { unique: true });

export const ReplayChunkModel = model<ReplayChunkDoc>('ReplayChunk', ReplayChunkSchema);
