import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { env } from '../../config/env';
import { redactTrackingShareToken } from '../utils/requestPath';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void {
  const requestId = res.locals.requestId;

  // Log error with request context
  logger.error('Error handling request', {
    requestId,
    name: err.name,
    message: err.message,
    stack: env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: redactTrackingShareToken(req.originalUrl || req.url),
    method: req.method,
  });

  // Handle known AppError instances (instanceof or duck-typed)
  if (err instanceof AppError || (err && typeof (err as any).statusCode === 'number' && typeof (err as any).code === 'string')) {
    const appErr = err as AppError;
    sendError(res, appErr.code, appErr.message, appErr.statusCode, appErr.details);
    return;
  }

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const formattedIssues = (err.issues || []).map((e) => ({
      path: Array.isArray(e.path) ? e.path.join('.') : String(e.path),
      message: e.message,
    }));
    sendError(res, 'VALIDATION_ERROR', 'Input validation failed', 400, formattedIssues);
    return;
  }

  // Handle JSON parse errors from body-parser
  if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
    sendError(res, 'INVALID_JSON', 'Malformed JSON payload provided', 400);
    return;
  }

  // Handle oversized body-parser payload limit errors (413 Payload Too Large)
  if ('type' in err && (err as { type: string }).type === 'entity.too.large') {
    sendError(res, 'PAYLOAD_TOO_LARGE', 'Request payload exceeds maximum allowed size limit', 413);
    return;
  }

  // Generic fallback: never leak internal stack traces or database info in production
  const safeMessage =
    env.NODE_ENV === 'production'
      ? 'An unexpected internal error occurred'
      : err.message || 'Internal server error';

  const details = env.NODE_ENV !== 'production' ? { stack: err.stack } : undefined;

  sendError(res, 'INTERNAL_SERVER_ERROR', safeMessage, 500, details);
}
