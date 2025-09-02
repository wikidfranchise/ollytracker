// app.js
require('dotenv').config({ path: '.env.local' });

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- View engine ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Core middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static assets (css, images, client js) from /public
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ready today ---
const trackerRouter = require('./routes/tracker');
app.use('/', trackerRouter);

// --- Optional: simple health endpoint ---
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    secToken: Boolean(process.env.SECAPI_TOKEN),
    finnhubToken: Boolean(process.env.FINNHUB_TOKEN),
    env: process.env.NODE_ENV || 'development'
  });
});

// --- Landing page -> /tracker ---
app.get('/', (req, res) => res.redirect('/tracker'));

// --- 404 ---
app.use((req, res) => {
  res.status(404).send('Sorry, page not found!');
});

// --- Error handler ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  const wantsJson = req.path.startsWith('/api/');
  if (wantsJson) {
    res.status(500).json({ error: 'Server error' });
  } else {
    res.status(500).send('Something broke!');
  }
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n🚀 OllyTracker Server Running`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`   ✅ Tracker: http://localhost:${PORT}/tracker`);
});
