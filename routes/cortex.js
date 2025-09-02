const express = require('express');
const router = express.Router();

// API Tokens
const SECAPI_TOKEN = process.env.SECAPI_TOKEN;
const DIRECTORS_API_ENDPOINT = 'https://api.sec-api.io/directors-and-board-members';
const FORM_8K_ENDPOINT = 'https://api.sec-api.io/form-8k-item-5-02';

// Serve the cortex page
router.get('/cortex', (req, res) => {
  res.render('cortex', { title: 'OllyCortex™ - Board of Directors Intelligence' });
});

// Company search endpoint (same as tracker)
router.get('/api/cortex-search', async (req, res) => {
  try {
    const { q } = req.query;
    console.log('Cortex search query:', q);
    
    if (!q || q.trim().length < 1) {
      return res.json([]);
    }
    
    const query = q.trim();
    let allResults = [];
    
    // Try ticker search first
    try {
      const tickerUrl = `https://api.sec-api.io/mapping/ticker/${encodeURIComponent(query.toUpperCase())}?token=${SECAPI_TOKEN}`;
      const tickerResponse = await fetch(tickerUrl);
      if (tickerResponse.ok) {
        const tickerData = await tickerResponse.json();
        if (Array.isArray(tickerData)) {
          allResults = allResults.concat(tickerData);
        } else if (tickerData && typeof tickerData === 'object') {
          allResults.push(tickerData);
        }
      }
    } catch (e) {
      console.log('Ticker search error:', e);
    }
    
    // Try name search
    try {
      const nameUrl = `https://api.sec-api.io/mapping/name/${encodeURIComponent(query)}?token=${SECAPI_TOKEN}`;
      const nameResponse = await fetch(nameUrl);
      if (nameResponse.ok) {
        const nameData = await nameResponse.json();
        if (Array.isArray(nameData)) {
          allResults = allResults.concat(nameData);
        } else if (nameData && typeof nameData === 'object') {
          allResults.push(nameData);
        }
      }
    } catch (e) {
      console.log('Name search error:', e);
    }
    
    // Try CIK search if query looks like a number
    if (/^\d+$/.test(query)) {
      try {
        const cikUrl = `https://api.sec-api.io/mapping/cik/${encodeURIComponent(query)}?token=${SECAPI_TOKEN}`;
        const cikResponse = await fetch(cikUrl);
        if (cikResponse.ok) {
          const cikData = await cikResponse.json();
          if (Array.isArray(cikData)) {
            allResults = allResults.concat(cikData);
          } else if (cikData && typeof cikData === 'object') {
            allResults.push(cikData);
          }
        }
      } catch (e) {
        console.log('CIK search error:', e);
      }
    }
    
    // Deduplicate by CIK
    const seen = new Set();
    const uniqueResults = [];
    for (const item of allResults) {
      if (item && item.cik && !seen.has(item.cik)) {
        seen.add(item.cik);
        uniqueResults.push({
          ticker: item.ticker || '',
          name: item.name || 'Unknown',
          cik: item.cik || '',
          exchange: item.exchange || '',
          isDelisted: item.isDelisted || false
        });
      }
    }
    
    // Sort by relevance
    uniqueResults.sort((a, b) => {
      const aTickerMatch = a.ticker && a.ticker.toLowerCase() === query.toLowerCase();
      const bTickerMatch = b.ticker && b.ticker.toLowerCase() === query.toLowerCase();
      if (aTickerMatch && !bTickerMatch) return -1;
      if (!aTickerMatch && bTickerMatch) return 1;
      return (a.ticker || '').localeCompare(b.ticker || '');
    });
    
    res.json(uniqueResults.slice(0, 30));
    
  } catch (error) {
    console.error('Error in /api/cortex-search:', error);
    res.status(500).json({ error: error.message });
  }
});

// Directors fetch endpoint
router.post('/api/cortex-directors', async (req, res) => {
  try {
    const { ticker, year, strategy } = req.body;
    console.log('Fetching directors for:', ticker, year, 'Strategy:', strategy);
    
    let requestBody = {
      query: `ticker:"${ticker}" AND filedAt:[${year}-01-01 TO ${year}-12-31]`,
      from: 0,
      size: 50,
      sort: [{ "filedAt": { "order": "desc" } }]
    };
    
    // Use the appropriate endpoint based on strategy
    let endpoint = DIRECTORS_API_ENDPOINT;
    if (strategy === 'director-changes') {
      endpoint = FORM_8K_ENDPOINT;
    }
    
    const response = await fetch(`${endpoint}?token=${SECAPI_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Filter for valid director data
    if (data.data) {
      const originalCount = data.data.length;
      data.data = data.data.filter(filing => 
        filing.directors && 
        filing.directors.length > 0 && 
        filing.directors.some(d => d.name && d.name.trim() && d.name !== 'N/A')
      );
      data.total.value = data.data.length;
      console.log(`Filtered from ${originalCount} to ${data.data.length} filings with director data`);
    }
    
    res.json(data);
    
  } catch (error) {
    console.error('Error fetching directors:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;