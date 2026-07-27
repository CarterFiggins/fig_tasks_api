import express from "express";
import type { Request } from "express";
import { db } from "../db";
import { requireAuth } from "../middleware/requireAuth";

export const tasksRouter = express.Router();

tasksRouter.delete("/:id", requireAuth, async (req, res) => {
  const userId = (req as Request & { user: { id: number } }).user.id;
  const taskId = Number(req.params.id);

  if (!Number.isInteger(taskId)) {
    return res.status(400).json({ error: "invalid task id" });
  }

  const [task] = await db`
    UPDATE tasks
    SET archived_at = now()
    WHERE id = ${taskId} AND user_id = ${userId} AND archived_at IS NULL
    RETURNING id, title, notes, recurring, due_date, position, archived_at
  `;

  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  res.json(task);
});

tasksRouter.post("/", requireAuth, async (req, res) => {
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

tasksRouter.get("/", requireAuth, async (req, res) => {
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

tasksRouter.patch("/:id", requireAuth, async (req, res) => {
  const userId = (req as Request & { user: { id: number } }).user.id;
  const taskId = Number(req.params.id);

  if (!Number.isInteger(taskId)) {
    return res.status(400).json({ error: "invalid task id" });
  }

  const { title, notes, recurring, category_id } = req.body;

  if (title !== undefined && (typeof title !== "string" || !title.trim())) {
    return res.status(400).json({ error: "title must be a non-empty string" });
  }

  const [existing] = await db`
    SELECT title, notes, recurring, category_id
    FROM tasks
    WHERE id = ${taskId} AND user_id = ${userId}
  `;
  if (!existing) {
    return res.status(404).json({ error: "Task not found" });
  }

  const [task] = await db`
    UPDATE tasks
    SET
      title = ${title ?? existing.title},
      notes = ${notes !== undefined ? notes : existing.notes},
      recurring = ${recurring !== undefined ? recurring : existing.recurring},
      category_id = ${category_id !== undefined ? category_id : existing.category_id},
      updated_at = now()
    WHERE id = ${taskId}
    RETURNING id, title, notes, recurring, due_date, position, archived_at
  `;

  res.json(task);
});

tasksRouter.post("/:id/complete", requireAuth, async (req, res) => {
  const userId = (req as Request & { user: { id: number } }).user.id;
  const taskId = Number(req.params.id);

  if (!Number.isInteger(taskId)) {
    return res.status(400).json({ error: "invalid task id" });
  }

  const [task] = await db`SELECT recurring FROM tasks WHERE id = ${taskId} AND user_id = ${userId}`;
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  const updated = await db.begin(async (tx) => {
    await tx`INSERT INTO task_completions (task_id, completed_at) VALUES (${taskId}, now())`;

    const [row] =
      task.recurring != null
        ? await tx`
            UPDATE tasks
            SET due_date = CURRENT_DATE + ${task.recurring}, archived_at = NULL, updated_at = now()
            WHERE id = ${taskId}
            RETURNING id, title, notes, recurring, due_date, position, archived_at
          `
        : await tx`
            UPDATE tasks
            SET archived_at = now(), due_date = NULL, updated_at = now()
            WHERE id = ${taskId}
            RETURNING id, title, notes, recurring, due_date, position, archived_at
          `;
    return row;
  });

  res.json(updated);
});

tasksRouter.delete("/:id/complete", requireAuth, async (req, res) => {
  const userId = (req as Request & { user: { id: number } }).user.id;
  const taskId = Number(req.params.id);

  if (!Number.isInteger(taskId)) {
    return res.status(400).json({ error: "invalid task id" });
  }

  const [task] = await db`SELECT recurring FROM tasks WHERE id = ${taskId} AND user_id = ${userId}`;
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  const updated = await db.begin(async (tx) => {
    const [lastCompletion] = await tx`
      SELECT id, completed_at FROM task_completions
      WHERE task_id = ${taskId}
      ORDER BY completed_at DESC
      LIMIT 1
    `;
    if (!lastCompletion) return null;

    await tx`DELETE FROM task_completions WHERE id = ${lastCompletion.id}`;

    const [priorCompletion] = await tx`
      SELECT completed_at FROM task_completions
      WHERE task_id = ${taskId}
      ORDER BY completed_at DESC
      LIMIT 1
    `;

    if (!priorCompletion) {
      const [row] = await tx`
        UPDATE tasks
        SET due_date = NULL, archived_at = NULL, updated_at = now()
        WHERE id = ${taskId}
        RETURNING id, title, notes, recurring, due_date, position, archived_at
      `;
      return row;
    }

    const [row] =
      task.recurring != null
        ? await tx`
            UPDATE tasks
            SET due_date = ${priorCompletion.completed_at.toISOString()}::date + ${task.recurring}, archived_at = NULL, updated_at = now()
            WHERE id = ${taskId}
            RETURNING id, title, notes, recurring, due_date, position, archived_at
          `
        : await tx`
            UPDATE tasks
            SET archived_at = ${priorCompletion.completed_at.toISOString()}, due_date = NULL, updated_at = now()
            WHERE id = ${taskId}
            RETURNING id, title, notes, recurring, due_date, position, archived_at
          `;
    return row;
  });

  if (!updated) {
    return res.status(404).json({ error: "No completion to undo" });
  }

  res.json(updated);
});
