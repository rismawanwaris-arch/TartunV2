# Tartun V2 Project Guidelines

## Tech Stack
- Backend: Node.js, Express
- Database: SQLite3 (with `sqlite3` package)
- Authentication: JWT, bcryptjs
- Module System: CommonJS (`require` / `module.exports`)

## Coding Standards
- **File Structure**: Keep routes modularized in the `routes/` directory and mount them in `server.js`.
- **Database**: All database interactions should go through `db.js`.
- **Async/Await**: Use the promisified methods provided in `db.js` (`db.getAsync`, `db.allAsync`, `db.runAsync`) with `async/await` instead of callbacks.
- **Error Handling**: Always use `try/catch` blocks in async route handlers and return consistent JSON error responses (e.g., `res.status(500).json({ error: 'Server error' })`).
- **Security**: Protect routes with the `authenticateToken` middleware from `middleware/auth.js` when they require a logged-in user.
- **Logging**: Log significant user actions (login, logout, data modification) into the `logs` table using `db.runAsync`.
