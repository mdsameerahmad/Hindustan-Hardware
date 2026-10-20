import { Response } from 'express';
import { ApiResponse } from '../../types';

export function sendSuccess<T>(
  res: Response,
  data?: T,
  message?: string,
  statusCode = 200,
  extraMeta?: Record<string, unknown>
): Response {
  const requestId = res.locals.requestId as string | undefined;

  const payload: ApiResponse<T> = {
    success: true,
    ...(message ? { message } : {}),
    ...(data !== undefined ? { data } : {}),
    meta: {
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
      ...extraMeta,
    },
  };

  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode = 500,
  details?: unknown
): Response {
  const requestId = res.locals.requestId as string | undefined;

  const payload: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...(requestId ? { requestId } : {}),
    },
  };

  return res.status(statusCode).json(payload);
}
