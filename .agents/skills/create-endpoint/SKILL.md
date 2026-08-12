---
name: create-endpoint
description: >-
  Guide and instructions for adding a new Express route/endpoint to the Tartun V2 backend.
  Use this skill when you need to create new API endpoints.
---

# Creating a New API Endpoint

Follow these steps to create a new API endpoint in the Tartun V2 project:

1. **Determine the Route File**:
   - If the endpoint relates to an existing resource (e.g., users, transactions), open the corresponding file in the `routes/` directory.
   - If it's a new resource, create a new file in `routes/` (e.g., `routes/new_resource.js`).

2. **Set up a New Route File** (if creating one):
   ```javascript
   const express = require('express');
   const router = express.Router();
   const db = require('../db');
   const { authenticateToken } = require('../middleware/auth');
   
   // ... define routes here ...
   
   module.exports = router;
   ```

3. **Register the New Route File**:
   - Open `server.js`.
   - Require the new route: `const newResourceRoutes = require('./routes/new_resource');`
   - Use it: `app.use('/api/new_resource', newResourceRoutes);`

4. **Define the Endpoint**:
   - Use `async/await` for database operations.
   - Example template:
     ```javascript
     router.post('/', authenticateToken, async (req, res) => {
       try {
         const { data } = req.body;
         // Input validation
         if (!data) return res.status(400).json({ error: 'Data is required' });
         
         // DB operation
         await db.runAsync('INSERT INTO some_table (col) VALUES (?)', [data]);
         
         res.json({ success: true });
       } catch (error) {
         console.error(error);
         res.status(500).json({ error: 'Server error' });
       }
     });
     ```
