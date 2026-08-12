---
name: db-operations
description: >-
  Guide and instructions for querying and interacting with the SQLite database in Tartun V2.
  Use this skill when you need to fetch, insert, update, or delete data.
---

# Database Operations Guide

The Tartun V2 project uses SQLite3 with a custom promisified wrapper defined in `db.js`.
Always use the `async` methods provided to prevent callback hell.

## Available Methods in `db.js`

1. **`db.getAsync(sql, params)`**
   - Use this to fetch a **single row**.
   - Example:
     ```javascript
     const user = await db.getAsync('SELECT * FROM users WHERE email = ?', [email]);
     ```

2. **`db.allAsync(sql, params)`**
   - Use this to fetch **multiple rows**.
   - Example:
     ```javascript
     const transactions = await db.allAsync('SELECT * FROM transactions WHERE user_id = ?', [userId]);
     ```

3. **`db.runAsync(sql, params)`**
   - Use this to execute an **INSERT**, **UPDATE**, or **DELETE** statement.
   - Example:
     ```javascript
     await db.runAsync('UPDATE users SET is_active = ? WHERE id = ?', [1, userId]);
     ```

## Best Practices
- **Parameterized Queries**: Always use `?` for variables to prevent SQL injection. Never concatenate strings into the SQL query.
- **Transactions**: For operations that require multiple queries to succeed together, SQLite3 does not have a built-in promise-based transaction wrapper in this project. Use standard `BEGIN TRANSACTION` and `COMMIT` or `ROLLBACK` via `db.runAsync` if necessary.
- **Logging**: When modifying critical data, consider inserting a log entry into the `logs` table simultaneously.
