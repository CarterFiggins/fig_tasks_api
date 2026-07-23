CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT,
  recurring INTEGER,
  due_date DATE,
  position INTEGER NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  user_id INTEGER NOT NULL REFERENCES users (id),
  category_id INTEGER REFERENCES categories (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX tasks_user_id_idx ON tasks (user_id);
CREATE INDEX tasks_category_id_idx ON tasks (category_id);
