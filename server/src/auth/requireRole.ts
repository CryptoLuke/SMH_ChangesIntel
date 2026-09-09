import type { Request, Response, NextFunction } from "express";
import type { Role } from "./users.js";

// Augments Express's Request with the role attached after auth resolves —
// avoids `as any` at every call site that reads req.userRole.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userRole?: Role;
    }
  }
}

/**
 * Route guard for admin-only actions (currently none — this is the seam
 * rollback's write endpoints will attach to). Must run after both
 * express-basic-auth and attachUserRole in the middleware chain, since it
 * depends on req.userRole being set.
 */
export function requireRole(required: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.userRole !== required) {
      return res.status(403).json({
        error: `This action requires the "${required}" role. Your account is "${req.userRole ?? "unknown"}".`,
      });
    }
    next();
  };
}
