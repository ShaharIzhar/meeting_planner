require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// SQLite setup
const db = new Database('sessions.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS participants (
    session_id TEXT NOT NULL,
    name TEXT NOT NULL,
    slots TEXT NOT NULL,
    PRIMARY KEY (session_id, name),
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
`);

// --- Session routes ---

// Create a new session
app.post('/api/sessions', (req, res) => {
  const { title } = req.body;
  const id = uuidv4().slice(0, 8);
  db.prepare('INSERT INTO sessions (id, title) VALUES (?, ?)').run(id, title || '');
  res.json({ id });
});

// Get session data
app.get('/api/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const rows = db.prepare('SELECT name, slots FROM participants WHERE session_id = ?').all(req.params.id);
  const participants = {};
  for (const row of rows) participants[row.name] = JSON.parse(row.slots);

  res.json({ id: session.id, title: session.title, participants });
});

// Update session title
app.patch('/api/sessions/:id', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { title } = req.body;
  if (title !== undefined) db.prepare('UPDATE sessions SET title = ? WHERE id = ?').run(title, req.params.id);
  res.json({ ok: true });
});

// Submit availability for a participant
app.post('/api/sessions/:id/availability', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { name, slots } = req.body;
  if (!name || !slots) return res.status(400).json({ error: 'name and slots required' });
  db.prepare('INSERT OR REPLACE INTO participants (session_id, name, slots) VALUES (?, ?, ?)').run(req.params.id, name, JSON.stringify(slots));
  res.json({ ok: true });
});

// Get overlapping slots
app.get('/api/sessions/:id/overlap', (req, res) => {
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const rows = db.prepare('SELECT slots FROM participants WHERE session_id = ?').all(req.params.id);
  if (rows.length === 0) return res.json({ overlap: [] });

  const slotCounts = {};
  for (const row of rows) {
    for (const slot of JSON.parse(row.slots)) {
      slotCounts[slot] = (slotCounts[slot] || 0) + 1;
    }
  }

  const total = rows.length;
  const overlap = Object.entries(slotCounts)
    .map(([slot, count]) => ({ slot, count, total }))
    .sort((a, b) => b.count - a.count);

  res.json({ overlap });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
