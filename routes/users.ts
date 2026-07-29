import express from "express";
import type { Request } from "express";
import { SQL } from "bun";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";

export const usersRouter = express.Router();

function currentUser(req: Request) {
  return (req as Request & { user: { id: number; account_id: number } }).user;
}

// Adds another user to the caller's own account (e.g. a family member sharing the same tasks).
usersRouter.post("/", requireAuth, async (req, res) => {
  const { name, email, password } = req.body;

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "email is required" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  const accountId = currentUser(req).account_id;
  const passwordHash = await Bun.password.hash(password);

  try {
    const [user] = await db`
      INSERT INTO users (name, email, password_hash, account_id)
      VALUES (${name}, ${email}, ${passwordHash}, ${accountId})
      RETURNING id, name, email, account_id, created_at
    `;
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof SQL.PostgresError && error.code === "23505") {
      return res.status(409).json({ error: "Email is already in use" });
    }
    throw error;
  }
});

usersRouter.get("/", requireAuth, async (req, res) => {
  const accountId = currentUser(req).account_id;
  const users = await db`
    SELECT id, name, email, created_at, updated_at
    FROM users
    WHERE account_id = ${accountId}
    ORDER BY id
  `;
  res.json(users);
});

usersRouter.patch("/:id", requireAuth, async (req, res) => {
  const accountId = currentUser(req).account_id;
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "invalid user id" });
  }

  const { name, email, password } = req.body;
  if (name !== undefined && (typeof name !== "string" || !name.trim())) {
    return res.status(400).json({ error: "name must be a non-empty string" });
  }
  if (email !== undefined && (typeof email !== "string" || !email.trim())) {
    return res.status(400).json({ error: "email must be a non-empty string" });
  }
  if (password !== undefined && (typeof password !== "string" || password.length < 8)) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  const [existing] = await db`
    SELECT name, email, password_hash FROM users WHERE id = ${userId} AND account_id = ${accountId}
  `;
  if (!existing) {
    return res.status(404).json({ error: "User not found" });
  }

  const passwordHash = password !== undefined ? await Bun.password.hash(password) : existing.password_hash;

  try {
    const [user] = await db`
      UPDATE users
      SET
        name = ${name ?? existing.name},
        email = ${email ?? existing.email},
        password_hash = ${passwordHash},
        updated_at = now()
      WHERE id = ${userId}
      RETURNING id, name, email, account_id, updated_at
    `;
    res.json(user);
  } catch (error) {
    if (error instanceof SQL.PostgresError && error.code === "23505") {
      return res.status(409).json({ error: "Email is already in use" });
    }
    throw error;
  }
});

usersRouter.delete("/:id", requireAuth, async (req, res) => {
  const accountId = currentUser(req).account_id;
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: "invalid user id" });
  }

  try {
    const deleted = await db.begin(async (tx) => {
      const [user] = await tx`
        SELECT id, name FROM users WHERE id = ${userId} AND account_id = ${accountId}
      `;
      if (!user) return null;

      await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
      await tx`DELETE FROM users WHERE id = ${userId}`;
      return user;
    });

    if (!deleted) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(deleted);
  } catch (error) {
    if (error instanceof SQL.PostgresError && error.code === "23503") {
      return res.status(409).json({ error: "User still has tasks; remove them first" });
    }
    throw error;
  }
});
