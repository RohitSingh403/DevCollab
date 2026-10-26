import { createHttpServer } from './app';
import { env } from './config';
import { connectDb, disconnectDb } from './db';
import { logger } from './logger';
import { seedDatabase } from './seed';

async function main() {
  await connectDb();
  if (env.seedOnBoot) {
    await seedDatabase();
  }
  const { httpServer } = createHttpServer();
  httpServer.listen(env.port, '0.0.0.0', () => {
    logger.info(`DevCollab API listening on 0.0.0.0:${env.port}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`Shutting down (${signal})`);
    httpServer.close(() => {
      disconnectDb().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error('Failed to start', error);
  process.exit(1);
});
