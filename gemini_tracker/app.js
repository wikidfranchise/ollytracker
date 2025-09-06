// app.js
// Loads .env.local then .env (both optional).
try { require('dotenv').config({ path: '.env.local' }); } catch {}
try { require('dotenv').config(); } catch {}

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Views ---
// Tell Express to look for EJS files in the 'views' directory
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- Core middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static assets -> ./public
// This serves your images from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes ---
// Load the tracker routes from the 'routes' directory
const trackerRouter = require('./routes/tracker');
app.use('/', trackerRouter);

// --- Root redirect ---
// Default to the tracker page
app.get('/', (_req, res) => res.redirect('/tracker'));


// --- 404 ---
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.status(404).send('<h1>404 - Page Not Found</h1><p>The OllyTracker engine you\'re looking for doesn\'t exist.</p>');
});

// --- Error handler ---
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({
      error: 'Server error',
      message: process.env.NODE_ENV === 'development' ? err.message : 'An unexpected error occurred.'
    });
  }
  res.status(500).send(`<h1>500 - Server Error</h1><pre>${err.stack}</pre>`);
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`
    🚀 OllyTracker Platform Started
    ================================
    📈 Tracker:  http://localhost:${PORT}/tracker
    ================================
    Environment: ${process.env.NODE_ENV || 'development'}
    SEC API:     ${process.env.SECAPI_TOKEN ? '✅ Configured' : '❌ Missing'}
  `);
});

