import express from "express";
import type { NextFunction, Request, Response } from "express";
import { db } from "./db";
import { createSession, destroySession, getUserForSession, parseCookies } from "./auth";

const app = express();
const PORT = process.env.PORT || 3017;

// Middleware to parse JSON bodies
app.use(express.json());

// Allow the fig_tasks_ui dev server to call this API
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Credentials", "true");
  next();
});

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const cookies = parseCookies(req.headers.cookie);
  const user = await getUserForSession(cookies.session_token);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  (req as Request & { user: typeof user }).user = user;
  next();
}

// Basic GET route
app.get("/", (req, res) => {
  res.send("Hello World from Bun and Express!");
});

app.post("/api/login", async (req, res) => {
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

app.post("/api/logout", async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.session_token) {
    await destroySession(cookies.session_token);
  }
  res.clearCookie("session_token");
  res.json({ message: "Logged out" });
});

app.post("/api/tasks", requireAuth, async (req, res) => {
  const { title, notes = null, recurring = null, category_id = null } = req.body;

  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title is required" });
  }

  const userId = (req as Request & { user: { id: number } }).user.id;
  const [{ next_position }] = await db`
    SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM tasks
  `;

  const [task] = await db`
    INSERT INTO tasks (title, notes, recurring, category_id, position, user_id)
    VALUES (${title}, ${notes}, ${recurring}, ${category_id}, ${next_position}, ${userId})
    RETURNING id, title, notes, recurring, due_date, position, archived_at
  `;

  res.status(201).json(task);
});

app.get("/api/tasks", requireAuth, async (req, res) => {
  const userId = (req as Request & { user: { id: number } }).user.id;
  const tasks = await db`
    SELECT id, title, notes, recurring, due_date, position, archived_at
    FROM tasks
    WHERE archived_at IS NULL
      AND (due_date IS NULL OR due_date <= CURRENT_DATE)
      AND user_id = ${userId}
    ORDER BY position
  `;

  res.json(tasks);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
