import type { Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { db } from "../db";
import { extractSessionCookie, resetDatabase, seedTestUser, startTestServer } from "./helpers";

let server: Server;
let baseUrl: string;
let cookie: string;

beforeAll(async () => {
  ({ server, baseUrl } = await startTestServer());
});

afterAll(() => {
  server.close();
});

beforeEach(async () => {
  await resetDatabase();
  await seedTestUser("test@example.com", "secret123");

  const res = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "test@example.com", password: "secret123" }),
  });
  cookie = extractSessionCookie(res)!;
});

function authedFetch(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...init.headers, Cookie: cookie },
  });
}

function createTask(body: Record<string, unknown>) {
  return authedFetch("/api/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/tasks", () => {
  test("requires auth", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`);
    expect(res.status).toBe(401);
  });

  test("returns only the current user's active tasks", async () => {
    const createRes = await createTask({ title: "Clean the bathroom", recurring: 20 });
    expect(createRes.status).toBe(201);

    const res = await authedFetch("/api/tasks");
    const tasks = await res.json();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Clean the bathroom");
  });

  test("does not return another user's tasks", async () => {
    await seedTestUser("other@example.com", "secret456");
    const otherLoginRes = await fetch(`${baseUrl}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "secret456" }),
    });
    const otherCookie = extractSessionCookie(otherLoginRes)!;

    await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: otherCookie },
      body: JSON.stringify({ title: "Someone else's task" }),
    });

    const res = await authedFetch("/api/tasks");
    const tasks = await res.json();
    expect(tasks).toHaveLength(0);
  });
});

describe("POST /api/tasks", () => {
  test("requires a title", async () => {
    const res = await createTask({});
    expect(res.status).toBe(400);
  });

  test("creates a task owned by the logged-in user", async () => {
    const res = await createTask({ title: "Buy groceries", notes: "Milk, eggs, bread" });
    expect(res.status).toBe(201);
    const task = await res.json();
    expect(task.title).toBe("Buy groceries");
    expect(task.notes).toBe("Milk, eggs, bread");
    expect(task.archived_at).toBeNull();
  });
});

describe("PATCH /api/tasks/:id", () => {
  test("updates only the fields provided", async () => {
    const created = await (await createTask({ title: "Original", recurring: 5 })).json();

    const patched = await (
      await authedFetch(`/api/tasks/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Renamed" }),
      })
    ).json();

    expect(patched.title).toBe("Renamed");
    expect(patched.recurring).toBe(5);
  });

  test("404s for a task that isn't yours", async () => {
    const res = await authedFetch("/api/tasks/999999", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Nope" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id", () => {
  test("soft-deletes by setting archived_at and hides it from the list", async () => {
    const created = await (await createTask({ title: "Throwaway" })).json();

    const deleted = await (await authedFetch(`/api/tasks/${created.id}`, { method: "DELETE" })).json();
    expect(deleted.archived_at).not.toBeNull();

    const tasks = await (await authedFetch("/api/tasks")).json();
    expect(tasks.find((t: { id: number }) => t.id === created.id)).toBeUndefined();
  });

  test("404s on a task that doesn't belong to you or doesn't exist", async () => {
    const res = await authedFetch("/api/tasks/999999", { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/tasks/:id/complete", () => {
  test("sets a future due_date for a recurring task and hides it from the active list", async () => {
    const created = await (await createTask({ title: "Clean the bathroom", recurring: 20 })).json();

    const completed = await (
      await authedFetch(`/api/tasks/${created.id}/complete`, { method: "POST" })
    ).json();
    expect(completed.archived_at).toBeNull();
    expect(completed.due_date).not.toBeNull();

    const tasks = await (await authedFetch("/api/tasks")).json();
    expect(tasks.find((t: { id: number }) => t.id === created.id)).toBeUndefined();

    const [row] = await db`SELECT count(*) FROM task_completions WHERE task_id = ${created.id}`;
    expect(Number(row.count)).toBe(1);
  });

  test("archives a one-off task instead of setting a due_date", async () => {
    const created = await (await createTask({ title: "Buy groceries" })).json();

    const completed = await (
      await authedFetch(`/api/tasks/${created.id}/complete`, { method: "POST" })
    ).json();
    expect(completed.archived_at).not.toBeNull();
    expect(completed.due_date).toBeNull();
  });

  test("404s for a task that isn't yours", async () => {
    const res = await authedFetch("/api/tasks/999999/complete", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tasks/:id/complete", () => {
  test("undoes a completion and returns the task to active", async () => {
    const created = await (await createTask({ title: "Water the plants", recurring: 7 })).json();
    await authedFetch(`/api/tasks/${created.id}/complete`, { method: "POST" });

    const undone = await (
      await authedFetch(`/api/tasks/${created.id}/complete`, { method: "DELETE" })
    ).json();
    expect(undone.due_date).toBeNull();
    expect(undone.archived_at).toBeNull();

    const [row] = await db`SELECT count(*) FROM task_completions WHERE task_id = ${created.id}`;
    expect(Number(row.count)).toBe(0);
  });

  test("falls back to the prior completion when one exists", async () => {
    const created = await (await createTask({ title: "Water the plants", recurring: 7 })).json();
    await authedFetch(`/api/tasks/${created.id}/complete`, { method: "POST" });
    await authedFetch(`/api/tasks/${created.id}/complete`, { method: "DELETE" });
    await authedFetch(`/api/tasks/${created.id}/complete`, { method: "POST" });
    await authedFetch(`/api/tasks/${created.id}/complete`, { method: "POST" });

    const undone = await (
      await authedFetch(`/api/tasks/${created.id}/complete`, { method: "DELETE" })
    ).json();
    expect(undone.due_date).not.toBeNull();
    expect(undone.archived_at).toBeNull();

    const [row] = await db`SELECT count(*) FROM task_completions WHERE task_id = ${created.id}`;
    expect(Number(row.count)).toBe(1);
  });

  test("404s when there's nothing to undo", async () => {
    const created = await (await createTask({ title: "Never completed" })).json();
    const res = await authedFetch(`/api/tasks/${created.id}/complete`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });
});
