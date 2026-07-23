import express from "express";

const app = express();
const PORT = process.env.PORT || 3017;

// Middleware to parse JSON bodies
app.use(express.json());

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
    { id: 1, title: "Task 1", completed: false },
    { id: 2, title: "Task 2", completed: true },
    { id: 3, title: "Task 3", completed: false },
  ];
  
  res.json(tasks);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
