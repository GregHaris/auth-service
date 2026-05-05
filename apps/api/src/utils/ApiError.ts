/**
 * ApiError — represents an intentional, operational error
 *
 * Every layer of the application (services, controllers, middleware)
 * throws this when something goes wrong in an expected way.
 *
 * The global error handler catches these and formats them into
 * consistent JSON responses.
 *
 * Usage:
 *   throw new ApiError(401, "Invalid credentials")
 *   throw new ApiError(409, "Email already in use")
 *   throw new ApiError(400, "Validation failed", validationErrors)
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errors: Record<string, string[]> | null;

  constructor(statusCode: number, message: string, errors: Record<string, string[]> | null = null) {
    // Call the parent Error constructor with the message
    // This sets this.message and captures the stack trace
    super(message);

    this.statusCode = statusCode;
    this.isOperational = true;
    // isOperational = true tells the error handler:
    // "I threw this on purpose, format it and send it to the client"

    this.errors = errors;
    // errors is for validation failures where you want to tell the
    // client specifically which fields failed and why
    // e.g. { email: ["Invalid email format"], password: ["Too short"] }

    // Maintains proper prototype chain for instanceof checks
    // Without this, `error instanceof ApiError` would return false
    // in compiled JavaScript
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  // ── Static factory methods ───────────────────────────
  // These are convenience constructors for common error types
  // They make throw sites more readable and self-documenting

  static badRequest(message: string, errors?: Record<string, string[]>) {
    return new ApiError(400, message, errors ?? null);
  }

  static unauthorized(message = 'Unauthorized') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Forbidden') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static conflict(message: string) {
    return new ApiError(409, message);
  }

  static tooManyRequests(message = 'Too many requests') {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}
