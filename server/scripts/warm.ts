import mongoose from 'mongoose';
import { config } from '../src/config.ts';
import { warm } from '../src/services/replay/warm.ts';

await mongoose.connect(config.MONGODB_URI);
try {
  console.log(JSON.stringify(await warm()));
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
