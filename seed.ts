import { db } from "./db";

const [account] = await db`
  INSERT INTO accounts (name) VALUES ('Personal') RETURNING id
`;

const passwordHash = await Bun.password.hash("password123");

const [user] = await db`
  INSERT INTO users (name, email, password_hash, account_id)
  VALUES ('Carter', 'carter@example.com', ${passwordHash}, ${account.id})
  RETURNING id
`;

await db`
  INSERT INTO tasks (title, notes, recurring, due_date, position, user_id)
  VALUES
    ('Clean the bathroom', NULL, 20, NULL, 1, ${user.id}),
    ('Buy groceries', 'Milk, eggs, bread', NULL, NULL, 2, ${user.id}),
    ('Water the plants', NULL, 7, NULL, 3, ${user.id})
`;

console.log("Seeded 1 account, 1 user, 3 tasks.");
await db.close();
