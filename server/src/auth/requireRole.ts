import type { Request, Response, NextFunction } from "express";
import type { Role } from "./workspaceStore.js";
import "./session.js";

/** Any logged-in workspace user (either role). Must run after the session
 *  middleware. Attaches nothing new — just gates on req.session.user. */
export function requireLogin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.user) {
    return res.status(401).json({ error: "Not logged in." });
  }
  next();
}

/** Requires a specific role within the caller's own workspace session. */
export function requireRole(required: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.user) {
      return res.status(401).json({ error: "Not logged in." });
    }
    if (req.session.user.role !== required) {
      return res.status(403).json({
        error: `This action requires the "${required}" role. Your account is "${req.session.user.role}".`,
      });
    }
    next();
  };
}

/** Gates the owner-only panel — a separate identity from any workspace's
 *  users, established via its own login endpoint. */
export function requireOwner(req: Request, res: Response, next: NextFunction) {
  if (!req.session.isOwner) {
    return res.status(403).json({ error: "Owner access required." });
  }
  next();
}
