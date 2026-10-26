import { ApiError } from './ApiError.js';

/**
 * A small in-process queue for heavy work (image processing). At most `concurrency` tasks run at once
 * and at most `maxWaiting` wait; beyond that callers get 503 with Retry-After instead of piling up and
 * exhausting the server's memory.
 */
export function createWorkQueue({ concurrency = 1, maxWaiting = 3, retryAfterSeconds = 10 } = {}) {
  let running = 0;
  const waiting = [];

  const next = () => {
    if (running >= concurrency || waiting.length === 0) return;
    const job = waiting.shift();
    running += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        running -= 1;
        next();
      });
  };

  return {
    run(task) {
      if (running >= concurrency && waiting.length >= maxWaiting) {
        const err = ApiError.unavailable('The server is busy processing other uploads. Please try again in a few seconds.', 'BUSY');
        err.retryAfter = retryAfterSeconds;
        return Promise.reject(err);
      }
      return new Promise((resolve, reject) => {
        waiting.push({ task, resolve, reject });
        next();
      });
    },
    get stats() {
      return { running, waiting: waiting.length };
    },
  };
}
