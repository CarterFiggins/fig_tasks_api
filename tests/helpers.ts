import type { Server } from "node:http";
import { app } from "../app";
import { db } from "../db";

export function startTestServer(): Promise<{ server: Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as { port: number };
      resolve({ server, baseUrl: `http://localhost:${port}` });
    });
  });
}

export async function resetDatabase() {
  await db`DELETE FROM sessions`;
  await db`DELETE FROM task_completions`;
  await db`DELETE FROM tasks`;
  await db`DELETE FROM users`;
  await db`DELETE FROM accounts`;
}

export async function seedTestUser(email: string, password: string) {
  const [account] = await db`INSERT INTO accounts (name) VALUES ('Test Account') RETURNING id`;
  const passwordHash = await Bun.password.hash(password);
  const [user] = await db`
    INSERT INTO users (name, email, password_hash, account_id)
    VALUES ('Test User', ${email}, ${passwordHash}, ${account.id})
    RETURNING id
  `;
  return { userId: user.id as number, accountId: account.id as number };
}

export function extractSessionCookie(res: Response) {
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) return null;
  return setCookie.split(";")[0];
}
