import mongoose from 'mongoose';
import { env } from './config';
import { logger } from './logger';

let memory: { stop(): Promise<boolean> } | null = null;

export async function connectDb() {
  if (!env.mongoUri) {
    throw new Error('MONGODB_URI is required. Use a MongoDB connection string, or "memory" for a local ephemeral database.');
  }
  let uri = env.mongoUri;
  if (uri === 'memory') {
    if (env.nodeEnv === 'production') {
      throw new Error('MONGODB_URI=memory is not allowed in production');
    }
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const server = await MongoMemoryServer.create();
    memory = server;
    uri = server.getUri();
    logger.info('Using in-memory MongoDB');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  logger.info('Connected to MongoDB');
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memory) {
    await memory.stop();
    memory = null;
  }
}
