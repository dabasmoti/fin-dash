import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../types.js';

/**
 * Global Express error-handling middleware.
 * Must have four parameters so Express treats it as an error handler.
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response<ApiResponse<never>>,
  _next: NextFunction,
): void {
  console.error('[ErrorHandler]', err.message, err.stack);

  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(statusCode).json({
    success: false,
    error: isProduction ? 'Internal server error' : (err.message || 'Internal server error'),
  });
}
