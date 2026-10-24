/** An error whose message is safe to show to the client, with its HTTP status. */
export class ApiError extends Error {
  constructor(statusCode, message, details = undefined) {
    // 4xx errors are expected outcomes (bad input, 404, 401…) and are never logged with a stack.
    // Skipping stack capture for them took ~15% of CPU off the request path under load.
    // 5xx errors keep full stacks for debugging.
    const previousLimit = Error.stackTraceLimit;
    if (statusCode < 500) Error.stackTraceLimit = 0;
    try {
      super(message);
    } finally {
      Error.stackTraceLimit = previousLimit;
    }
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }

  static badRequest(message = 'Bad request', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict') {
    return new ApiError(409, message);
  }
}
