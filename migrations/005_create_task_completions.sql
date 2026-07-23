CREATE TABLE task_completions (
  id SERIAL PRIMARY KEY,
  task_id INTEGER NOT NULL REFERENCES tasks (id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX task_completions_task_id_idx ON task_completions (task_id);
