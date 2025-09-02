const express = require('express');
const router = express.Router();

// API Token
const SECAPI_TOKEN = process.env.SECAPI_TOKEN;
const COMP_API_URL = 'https://api.sec-api.io/compensation';

// Serve the comp page
router.get('/comp', (req, res) => {
  res.render('comp', { title: 'OllyComp™ - Executive Compensation Exposer' });
});

// Compensation search endpoint
router.post('/api/comp-search', async (req, res) => {
  try {
    const requestBody = req.body;
    console.log('Comp search request:', requestBody);
    
    const response = await fetch(COMP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': SECAPI_TOKEN
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
    
  } catch (error) {
    console.error('Error in /api/comp-search:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;