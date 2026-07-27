import express from "express";
import { db } from "../db";
import { createSession, destroySession, parseCookies } from "../auth";

export const authRouter = express.Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "email and password are required" });
  }

  const [user] = await db`SELECT id, password_hash FROM users WHERE email = ${email}`;
  const valid = user && (await Bun.password.verify(password, user.password_hash));
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const { token, expiresAt } = await createSession(user.id);
  res.cookie("session_token", token, {
    httpOnly: true,
    sameSite: "lax",
    expires: expiresAt,
  });
  res.json({ message: "Logged in" });
});

authRouter.post("/logout", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.session_token) {
    await destroySession(cookies.session_token);
  }
  res.clearCookie("session_token");
  res.json({ message: "Logged out" });
});
