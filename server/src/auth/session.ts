import "express-session";
import type { Role } from "./workspaceStore.js";

declare module "express-session" {
  interface SessionData {
    user?: { orgName: string; username: string; role: Role };
    isOwner?: boolean;
  }
}
