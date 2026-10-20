import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = res.locals.requestId;

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    logger.info('HTTP Request handled', {
      requestId,
      method: req.method,
      url: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });

  next();
}
