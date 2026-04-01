require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// Supabase setup
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// --- Session routes ---

// Create a new session
app.post('/api/sessions', async (req, res) => {
  const { title } = req.body;
  const id = uuidv4().slice(0, 8);
  const { error } = await supabase.from('sessions').insert({ id, title: title || '' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ id });
});

// Get session data
app.get('/api/sessions/:id', async (req, res) => {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (sessionError || !session) return res.status(404).json({ error: 'Session not found' });

  const { data: rows, error: rowsError } = await supabase
    .from('participants')
    .select('name, slots')
    .eq('session_id', req.params.id);
  if (rowsError) return res.status(500).json({ error: rowsError.message });

  const participants = {};
  for (const row of rows) participants[row.name] = row.slots;

  res.json({ id: session.id, title: session.title, settings: session.settings ?? null, participants });
});

// Update session title
app.patch('/api/sessions/:id', async (req, res) => {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', req.params.id)
    .single();
  if (sessionError || !session) return res.status(404).json({ error: 'Session not found' });

  const { title, settings } = req.body;
  const updates = {};
  if (title !== undefined) updates.title = title;
  if (settings !== undefined) updates.settings = settings;
  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('sessions').update(updates).eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
  }
  res.json({ ok: true });
});

// Submit availability for a participant
app.post('/api/sessions/:id/availability', async (req, res) => {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', req.params.id)
    .single();
  if (sessionError || !session) return res.status(404).json({ error: 'Session not found' });

  const { name, slots } = req.body;
  if (!name || !slots) return res.status(400).json({ error: 'name and slots required' });

  const { error } = await supabase
    .from('participants')
    .upsert({ session_id: req.params.id, name, slots }, { onConflict: 'session_id,name' });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Get overlapping slots
app.get('/api/sessions/:id/overlap', async (req, res) => {
  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id')
    .eq('id', req.params.id)
    .single();
  if (sessionError || !session) return res.status(404).json({ error: 'Session not found' });

  const { data: rows, error: rowsError } = await supabase
    .from('participants')
    .select('slots')
    .eq('session_id', req.params.id);
  if (rowsError) return res.status(500).json({ error: rowsError.message });

  if (rows.length === 0) return res.json({ overlap: [] });

  const slotCounts = {};
  for (const row of rows) {
    for (const slot of row.slots) {
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
