import express from "express";
import type { Request } from "express";
import { SQL } from "bun";
import { db } from "../db";
import { createSession } from "../auth";
import { requireAuth } from "../middleware/requireAuth";

export const accountsRouter = express.Router();

function accountIdOf(req: Request) {
  return (req as Request & { user: { account_id: number } }).user.account_id;
}

// Creates an account plus the user for the person creating it, then logs them in.
accountsRouter.post("/", async (req, res) => {
  const { accountName, name, email, password } = req.body;

  if (typeof accountName !== "string" || !accountName.trim()) {
    return res.status(400).json({ error: "accountName is required" });
  }
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ error: "email is required" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ error: "password must be at least 8 characters" });
  }

  const passwordHash = await Bun.password.hash(password);

  let created;
  try {
    created = await db.begin(async (tx) => {
      const [account] = await tx`
        INSERT INTO accounts (name) VALUES (${accountName}) RETURNING id, name, created_at
      `;
      const [user] = await tx`
        INSERT INTO users (name, email, password_hash, account_id)
        VALUES (${name}, ${email}, ${passwordHash}, ${account.id})
        RETURNING id, name, email, account_id
      `;
      return { account, user };
    });
  } catch (error) {
    if (error instanceof SQL.PostgresError && error.code === "23505") {
      return res.status(409).json({ error: "Email is already in use" });
    }
    throw error;
  }

  const { token, expiresAt } = await createSession(created.user.id);
  res.cookie("session_token", token, { httpOnly: true, sameSite: "lax", expires: expiresAt });
  res.status(201).json(created);
});

accountsRouter.get("/:id", requireAuth, async (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId)) {
    return res.status(400).json({ error: "invalid account id" });
  }
  if (accountId !== accountIdOf(req)) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const [account] = await db`SELECT id, name, created_at, updated_at FROM accounts WHERE id = ${accountId}`;
  if (!account) {
    return res.status(404).json({ error: "Account not found" });
  }
  res.json(account);
});

accountsRouter.patch("/:id", requireAuth, async (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId)) {
    return res.status(400).json({ error: "invalid account id" });
  }
  if (accountId !== accountIdOf(req)) {
    return res.status(403).json({ error: "Not allowed" });
  }

  const { name } = req.body;
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  const [account] = await db`
    UPDATE accounts
    SET name = ${name}, updated_at = now()
    WHERE id = ${accountId}
    RETURNING id, name, created_at, updated_at
  `;
  res.json(account);
});

accountsRouter.delete("/:id", requireAuth, async (req, res) => {
  const accountId = Number(req.params.id);
  if (!Number.isInteger(accountId)) {
    return res.status(400).json({ error: "invalid account id" });
  }
  if (accountId !== accountIdOf(req)) {
    return res.status(403).json({ error: "Not allowed" });
  }

  try {
    const [account] = await db`DELETE FROM accounts WHERE id = ${accountId} RETURNING id, name`;
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    res.json(account);
  } catch (error) {
    if (error instanceof SQL.PostgresError && error.code === "23503") {
      return res.status(409).json({ error: "Account still has users; remove them first" });
    }
    throw error;
  }
});
