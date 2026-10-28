// Child process for the load test: runs the API in its own process (as in production) and prints its port.
// Options arrive as JSON in LOAD_APP_OPTIONS, e.g. {"redisRateLimit":false,"apiRateLimit":10000000}.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
process.env.LOG_LEVEL ??= 'warn';

const { createApp } = await import('../../src/app.js');
const { createHttpServer } = await import('../../src/httpServer.js');
const { connectRedis, isRedisEnabled } = await import('../../src/config/redis.js');

if (isRedisEnabled()) await connectRedis();
const options = JSON.parse(process.env.LOAD_APP_OPTIONS ?? '{}');
const server = createHttpServer(createApp(options));
// A large accept backlog so a burst of thousands of new connections isn't refused by the OS queue.
server.listen({ port: 0, host: '127.0.0.1', backlog: 4096 }, () => {
  process.stdout.write(`PORT=${server.address().port}\n`);
});
process.on('SIGTERM', () => server.close(() => process.exit(0)));
// Windows can't deliver SIGTERM to a child; the load runner asks over IPC so the process exits cleanly.
process.on('message', (msg) => {
  if (msg === 'shutdown') {
    server.closeAllConnections();
    server.close(() => process.exit(0));
  }
});
