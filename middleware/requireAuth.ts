import type { NextFunction, Request, Response } from "express";
import { getUserForSession, parseCookies } from "../auth";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const user = await getUserForSession(cookies.session_token);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  (req as Request & { user: typeof user }).user = user;
  next();
}
