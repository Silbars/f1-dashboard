import { model, Schema } from 'mongoose';

// One row per circuit (Jolpica id). An empty outline records that OpenF1 had no usable lap, so it is not retried.
const CircuitOutlineSchema = new Schema({
  circuitId: { type: String, required: true, unique: true },
  outline: { type: Schema.Types.Mixed, required: true },
});

export const CircuitOutlineModel = model('CircuitOutline', CircuitOutlineSchema);
