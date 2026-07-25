import { db } from "./db";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function createSession(userId: number) {
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await db`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expiresAt})`;
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await db`DELETE FROM sessions WHERE token = ${token}`;
}

export async function getUserForSession(token: string | undefined) {
  if (!token) return null;
  const [user] = await db`
    SELECT users.id, users.name, users.email, users.account_id
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ${token} AND sessions.expires_at > now()
  `;
  return user ?? null;
}

export function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}
