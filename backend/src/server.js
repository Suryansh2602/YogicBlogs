// Load backend/.env first, before any module reads the settings: lets `nodemon src/server.js` (or plain
// `node src/server.js`) work without --env-file. Variables already set (e.g. by the host) win.
import 'dotenv/config';
import { createApp } from './app.js';
import { createHttpServer, requestTimeoutFor } from './httpServer.js';
import { env } from './config/env.js';
import { closeDatabase, pingDatabase } from './config/db.js';
import { closeRedis, connectRedis, isRedisEnabled } from './config/redis.js';
import { logger } from './utils/logger.js';
import { announceAdminSetup } from './modules/admin/admin.service.js';
import { cleanupStaleUploads } from './modules/media/media.upload.js';

// Crash loudly instead of silently: log, then let the process manager restart us.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  process.exit(1);
});

async function start() {
  // Hard dependencies: refuse to start rather than serve half-working.
  try {
    await pingDatabase();
    logger.info('Connected to MySQL');
    if (isRedisEnabled()) {
      await connectRedis();
      logger.info('Connected to Redis');
    } else {
      logger.warn('Redis disabled (REDIS_ENABLED=false): in-memory rate limits, no cache. Development only.');
    }
  } catch (err) {
    logger.fatal({ err }, 'Could not connect to a required service');
    process.exit(1);
  }

  // Uploads interrupted by a crash or restart leave temp files behind: clear them now and every hour.
  const sweepUploads = () =>
    cleanupStaleUploads()
      .then((removed) => removed && logger.info({ removed }, 'Removed leftover upload files'))
      .catch((err) => logger.warn({ err }, 'Could not clean up leftover upload files'));
  void sweepUploads();
  setInterval(sweepUploads, 60 * 60 * 1000).unref();

  const server = createHttpServer(createApp(), { requestTimeout: requestTimeoutFor(env.MAX_IMAGE_MB) }).listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}/api/v1`);
    announceAdminSetup().catch((err) => logger.error({ err }, 'Could not check for an admin account'));
  });

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down`);

    server.close(async (err) => {
      if (err) logger.error({ err }, 'Error while closing HTTP server');
      await Promise.allSettled([closeDatabase(), closeRedis()]);
      process.exit(err ? 1 : 0);
    });
    // Force exit if open connections hang.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
