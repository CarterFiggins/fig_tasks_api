import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { extractSessionCookie, resetDatabase, seedTestUser, startTestServer } from "./helpers";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  ({ server, baseUrl } = await startTestServer());
});

afterAll(() => {
  server.close();
});

beforeEach(resetDatabase);

describe("POST /api/login", () => {
  test("logs in with correct credentials and sets a session cookie", async () => {
    await seedTestUser("test@example.com", "secret123");

    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "secret123" }),
    });

    expect(res.status).toBe(200);
    expect(extractSessionCookie(res)).toMatch(/^session_token=/);
  });

  test("rejects an incorrect password", async () => {
    await seedTestUser("test@example.com", "secret123");

    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "wrong" }),
    });

    expect(res.status).toBe(401);
  });

  test("rejects an unknown email", async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "whatever" }),
    });

    expect(res.status).toBe(401);
  });

  test("rejects a missing password", async () => {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/logout", () => {
  test("clears the session so the cookie no longer authenticates", async () => {
    await seedTestUser("test@example.com", "secret123");
    const loginRes = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com", password: "secret123" }),
    });
    const cookie = extractSessionCookie(loginRes)!;

    const logoutRes = await fetch(`${baseUrl}/api/logout`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(logoutRes.status).toBe(200);

    const tasksRes = await fetch(`${baseUrl}/api/tasks`, { headers: { Cookie: cookie } });
    expect(tasksRes.status).toBe(401);
  });
});
