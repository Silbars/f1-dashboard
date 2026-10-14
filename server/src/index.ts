import http from 'node:http';
import path from 'node:path';
import mongoose from 'mongoose';
import { createApp } from './app.ts';
import { config } from './config.ts';

await mongoose.connect(config.MONGODB_URI);

const clientDir = config.NODE_ENV === 'production' ? path.resolve(import.meta.dirname, '../../client/dist') : undefined;
const server = http.createServer(createApp({ clientDir }));
server.listen(config.PORT, () => {
  console.log(`F1 dashboard server listening on :${config.PORT}`);
});
