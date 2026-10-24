import pino from 'pino';
import { env } from '../config/env.js';

const pretty = !env.isProduction && !env.isTest;

export const logger = pino({
  level: env.isTest ? 'silent' : env.isProduction ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
  ...(pretty && { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});
