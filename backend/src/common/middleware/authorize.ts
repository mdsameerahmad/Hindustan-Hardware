import { Request, Response, NextFunction } from 'express';
import { ForbiddenError, UnauthorizedError } from '../errors';
import { UserRole } from '../../types';

/**
 * Middleware factory for role-based access control.
 * Requires user to be authenticated and have one of the required roles.
 * Fails closed if req.user is absent or role is unauthorized.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required prior to authorization check.'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ForbiddenError(
          `Access denied. Requires one of the following roles: [${allowedRoles.join(', ')}].`
        )
      );
    }

    next();
  };
}
