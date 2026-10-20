import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const REQUEST_ID_HEADER = 'x-request-id';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const existingId = req.header(REQUEST_ID_HEADER);
  const requestId = existingId || uuidv4();

  // Attach to response headers and locals for use in logs and responses
  res.setHeader(REQUEST_ID_HEADER, requestId);
  res.locals.requestId = requestId;
  (req as unknown as { id: string }).id = requestId;

  next();
}
