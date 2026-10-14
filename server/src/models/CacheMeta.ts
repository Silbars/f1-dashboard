import { model, Schema } from 'mongoose';

// One row per upstream fetch (e.g. "schedule:2025"), recording when it was last fetched.
const CacheMetaSchema = new Schema({
  key: { type: String, required: true, unique: true },
  fetchedAt: { type: Date, required: true },
});

export const CacheMeta = model('CacheMeta', CacheMetaSchema);
