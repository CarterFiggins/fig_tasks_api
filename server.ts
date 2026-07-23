import express from "express";

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

app.get("/api/tasks", (req, res) => {
  // Example tasks data
  const tasks = [
    {
      id: 1,
      title: "Clean the bathroom",
      notes: null,
      recurring: 20,
      due_date: null,
      position: 1,
      archived_at: null,
    },
    {
      id: 2,
      title: "Buy groceries",
      notes: "Milk, eggs, bread",
      recurring: null,
      due_date: null,
      position: 2,
      archived_at: null,
    },
    {
      id: 3,
      title: "Water the plants",
      notes: null,
      recurring: 7,
      due_date: null,
      position: 3,
      archived_at: null,
    },
  ];

  res.json(tasks);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
