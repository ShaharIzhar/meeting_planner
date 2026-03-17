require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// In-memory session store
const sessions = {};

// --- Session routes ---

// Create a new session
app.post('/api/sessions', (req, res) => {
  const { title } = req.body;
  const id = uuidv4().slice(0, 8);
  sessions[id] = { id, title: title || '', participants: {} };
  res.json({ id });
});

// Get session data
app.get('/api/sessions/:id', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// Update session title
app.patch('/api/sessions/:id', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { title } = req.body;
  if (title !== undefined) session.title = title;
  res.json({ ok: true });
});

// Submit availability for a participant
app.post('/api/sessions/:id/availability', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const { name, slots } = req.body; // slots: array of "day-hour" strings e.g. "Mon-9"
  if (!name || !slots) return res.status(400).json({ error: 'name and slots required' });
  session.participants[name] = slots;
  res.json({ ok: true });
});

// Get overlapping slots
app.get('/api/sessions/:id/overlap', (req, res) => {
  const session = sessions[req.params.id];
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const participants = Object.values(session.participants);
  if (participants.length === 0) return res.json({ overlap: [] });

  const slotCounts = {};
  for (const slots of participants) {
    for (const slot of slots) {
      slotCounts[slot] = (slotCounts[slot] || 0) + 1;
    }
  }

  const total = participants.length;
  const overlap = Object.entries(slotCounts)
    .map(([slot, count]) => ({ slot, count, total }))
    .sort((a, b) => b.count - a.count);

  res.json({ overlap });
});


app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
