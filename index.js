require('dotenv').config();
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis');
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
  sessions[id] = { id, title: title || 'Meeting', participants: {} };
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

// --- Google OAuth routes ---

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/callback`
  );
}

app.get('/auth/google', (req, res) => {
  const { sessionId, slot } = req.query;
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: JSON.stringify({ sessionId, slot }),
  });
  res.redirect(url);
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  const { sessionId, slot } = JSON.parse(state);
  const oauth2Client = getOAuthClient();

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const session = sessions[sessionId];
    const [day, hour] = slot.split('-');
    const hourInt = parseInt(hour);

    // Map day name to next occurrence date
    const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
    const today = new Date();
    const targetDay = dayMap[day];
    const diff = (targetDay - today.getDay() + 7) % 7 || 7;
    const meetDate = new Date(today);
    meetDate.setDate(today.getDate() + diff);
    meetDate.setHours(hourInt, 0, 0, 0);

    const endDate = new Date(meetDate);
    endDate.setHours(hourInt + 1);

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const event = await calendar.events.insert({
      calendarId: 'primary',
      conferenceDataVersion: 1,
      requestBody: {
        summary: session?.title || 'Team Meeting',
        start: { dateTime: meetDate.toISOString() },
        end: { dateTime: endDate.toISOString() },
        conferenceData: {
          createRequest: { requestId: uuidv4() },
        },
      },
    });

    const meetLink = event.data.conferenceData?.entryPoints?.[0]?.uri || event.data.htmlLink;
    res.redirect(`/session.html?id=${sessionId}&meetLink=${encodeURIComponent(meetLink)}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Failed to create meeting: ' + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
