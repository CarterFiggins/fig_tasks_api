import express from "express";
import { authRouter } from "./routes/auth";
import { tasksRouter } from "./routes/tasks";

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

// Basic GET route
app.get("/", (req, res) => {
  res.send("Hello World from Bun and Express!");
});

app.use("/api", authRouter);
app.use("/api/tasks", tasksRouter);

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
