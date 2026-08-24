---
name: debug-testing
description: >-
  Guidelines and runbooks for debugging and running safe error tests in Tartun V2,
  covering mock testing, backend endpoint testing, database safety, and frontend script isolation.
---

# Safe Debugging and Testing Guide for Tartun V2

This guide outlines the standard operating procedures (SOP) for running debug scripts, verifying error-handling logic, and testing features in Tartun V2 without endangering the live environment or polluting the database.

---

## 1. Golden Rules of Testing
- **Never test on active data**: Before running any modifying commands on `data/tartun.db`, duplicate the database file to a temporary location (e.g., `data/tartun_test.db`) or run scripts inside a transaction that is rolled back.
- **Isolate client-side code**: When debugging UI scripts (`main.js`, `handlers.js`), extract/isolate the functions into sandboxed Node.js scripts using mock objects (`App`, `document`, `this.state`) to test logic without spinning up a full browser.
- **Keep scratch directories clean**: Store test files and temporary JSON outputs in the conversation's scratch directory:
  `~/.gemini/antigravity/brain/<conversation-id>/scratch/`

---

## 2. Safe Database Debugging & Queries
Because loading the native `sqlite3` driver in Node.js inside the sandbox can fail due to binary mismatch issues, always use the built-in macOS/Linux `sqlite3` CLI utility via standard commands:

### Safe Inspection Query Template
Use `sqlite3` to perform fast read-only checks:
```bash
# View table schema
sqlite3 data/tartun.db ".schema transactions"

# View recent transactions safely (always use LIMIT)
sqlite3 data/tartun.db "SELECT id, tanggal, nama, jumlah, keterangan FROM transactions ORDER BY id DESC LIMIT 5"
```

### Temporary Test Database (Duplication)
```bash
# Create a copy of the DB for destructive testing
cp data/tartun.db data/tartun_test.db

# Run modifying commands on the copy
sqlite3 data/tartun_test.db "DELETE FROM transactions WHERE tanggal < '2026-08-01'"

# Cleanup after testing
rm data/tartun_test.db
```

---

## 3. Mock Endpoint & API Testing
To verify backend routing (`routes/transactions.js`, etc.) without manual browser interaction, write a mock Node.js test script using a temporary express port:

```javascript
const express = require('express');
const { spawn } = require('child_process');

// 1. You can test your endpoints by running the app locally on a different port (e.g. PORT=3001)
// 2. Write a scratch script that makes HTTP requests using fetch()
// 3. Clean up database inserts at the end of the test using a DELETE query
```

---

## 4. Client-side Logic (RegEx & Parsing) Isolation
When testing front-end parsing rules (like KlikBCA text parsing or CSV delimiter checks):
1. **Mock DOM elements**: Write a minimal jsdom wrapper or construct standard JS objects to represent the UI inputs (e.g. `{ value: "test-data" }`).
2. **Execute inside standard Node.js VM**: Use a simple Node unit script to pass mock input to the target function and assert the output matches expectations.
