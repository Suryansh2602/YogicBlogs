/**
 * An error whose message is safe to show to the client, with its HTTP status and an optional
 * machine-readable `code` (e.g. "EMAIL_NOT_VERIFIED") the frontend can branch on.
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = undefined, code = undefined) {
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
    this.code = code;
  }

  static badRequest(message = 'Bad request', details, code) {
    return new ApiError(400, message, details, code);
  }

  static unauthorized(message = 'Unauthorized', code) {
    return new ApiError(401, message, undefined, code);
  }

  static forbidden(message = 'Forbidden', code) {
    return new ApiError(403, message, undefined, code);
  }

  static notFound(message = 'Not found') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflict', code) {
    return new ApiError(409, message, undefined, code);
  }

  static tooManyRequests(message = 'Too many attempts, please try again later', code) {
    return new ApiError(429, message, undefined, code);
  }

  static unavailable(message = 'Service temporarily unavailable', code) {
    return new ApiError(503, message, undefined, code);
  }
}
