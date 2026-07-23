import express from "express";
import { db } from "./db";

const app = express();
const PORT = process.env.PORT || 3017;

// Middleware to parse JSON bodies
app.use(express.json());

// Allow the fig_tasks_ui dev server to call this API
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Basic GET route
app.get("/", (req, res) => {
  res.send("Hello World from Bun and Express!");
});

// Basic POST route
app.post("/api/data", (req, res) => {
  const data = req.body;
  res.json({ message: "Data received", yourData: data });
});

app.get("/api/tasks", async (req, res) => {
  const tasks = await db`
    SELECT id, title, notes, recurring, due_date, position, archived_at
    FROM tasks
    WHERE archived_at IS NULL
      AND (due_date IS NULL OR due_date <= CURRENT_DATE)
    ORDER BY position
  `;

  res.json(tasks);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
