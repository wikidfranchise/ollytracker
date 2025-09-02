const express = require('express');
const router = express.Router();

// API Tokens
const SECAPI_TOKEN = process.env.SECAPI_TOKEN;

// Serve the lookup page
router.get('/lookup', (req, res) => {
  res.render('lookup', { title: 'OllyLookup™ - Company Research Directory' });
});

// Company search endpoint - uses SEC API for live data
router.get('/api/lookup-search', async (req, res) => {
  try {
    const { q, includeDelisted } = req.query;
    console.log('Lookup search query:', q, 'Include delisted:', includeDelisted);
    
    if (!q || q.trim().length < 1) {
      return res.json([]);
    }
    
    const query = q.trim();
    let allResults = [];
    
    // Try ticker search first
    try {
      const tickerUrl = `https://api.sec-api.io/mapping/ticker/${encodeURIComponent(query)}?token=${SECAPI_TOKEN}`;
      console.log('Searching ticker:', tickerUrl);
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
      console.log('Searching name:', nameUrl);
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
        console.log('Searching CIK:', cikUrl);
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
          company_name: item.name || 'Unknown',
          cik: item.cik || '',
          exchange: item.exchange || '',
          isDelisted: item.isDelisted || false
        });
      }
    }
    
    // Filter delisted if requested
    let finalResults = uniqueResults;
    if (includeDelisted === 'false') {
      finalResults = uniqueResults.filter(r => !r.isDelisted);
    }
    
    // Sort by relevance
    finalResults.sort((a, b) => {
      const aTickerMatch = a.ticker && a.ticker.toLowerCase() === query.toLowerCase();
      const bTickerMatch = b.ticker && b.ticker.toLowerCase() === query.toLowerCase();
      if (aTickerMatch && !bTickerMatch) return -1;
      if (!aTickerMatch && bTickerMatch) return 1;
      return (a.ticker || '').localeCompare(b.ticker || '');
    });
    
    console.log(`Found ${finalResults.length} results for query: ${query}`);
    res.json(finalResults.slice(0, 100));
    
  } catch (error) {
    console.error('Error in /api/lookup-search:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;