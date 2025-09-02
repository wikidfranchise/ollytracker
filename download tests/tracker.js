const express = require('express');
const router = express.Router();

// API Tokens
const SECAPI_TOKEN = "fad7a2d6ac4447db3d2bdcd70003e2ea41ad47adedfd617fa4185c755fab3efd";
const FINNHUB_TOKEN = "d296c09r01qhoena6il0d296c09r01qhoena6ilg";

// Serve the tracker HTML page
router.get('/tracker', (req, res) => {
  res.sendFile('tracker.html', { root: 'public' });
});

// Company lookup endpoint
router.get('/api/lookup', async (req, res) => {
  try {
    const { q } = req.query;
    console.log('Lookup query:', q);
    if (!q) return res.json([]);
    
    const url = `https://api.sec-api.io/mapping/ticker/${encodeURIComponent(q)}?token=${SECAPI_TOKEN}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      const url2 = `https://api.sec-api.io/mapping/name/${encodeURIComponent(q)}?token=${SECAPI_TOKEN}`;
      const response2 = await fetch(url2);
      if (!response2.ok) return res.json([]);
      const data = await response2.json();
      return res.json(data.slice(0, 50));
    }
    
    const data = await response.json();
    const filtered = data.filter(r => r.ticker && r.ticker.toLowerCase().includes(q.toLowerCase()));
    console.log('Found results:', filtered.length);
    res.json(filtered.slice(0, 50));
    
  } catch (error) {
    console.error('Error in /api/lookup:', error);
    res.json([]);
  }
});

// Stock quote endpoint
router.get('/api/quote', async (req, res) => {
  try {
    const { ticker } = req.query;
    console.log('Quote request for:', ticker);
    if (!ticker) return res.status(400).json({ error: 'Ticker required' });
    
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
    
  } catch (error) {
    console.error('Error in /api/quote:', error);
    res.status(500).json({ error: error.message });
  }
});

// Company profile endpoint
router.get('/api/profile', async (req, res) => {
  try {
    const { ticker } = req.query;
    console.log('Profile request for:', ticker);
    if (!ticker) return res.status(400).json({ error: 'Ticker required' });
    
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
    
  } catch (error) {
    console.error('Error in /api/profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to calculate OllyScore
async function calculateLiteScore(director, currentCik) {
  let points = 0;
  try {
    const position = (director.position || '').toLowerCase();
    if (position.includes('ceo') || position.includes('chief executive') || 
        position.includes('cfo') || position.includes('chief financial')) {
      points += 3;
    } else if (position.includes('chairman') || position.includes('chair')) {
      points += 2;
    } else {
      points += 1;
    }
  } catch(e) {
    console.error(`Scoring error for ${director.name}:`, e);
  }

  let level = 'low';
  if (points >= 5) level = 'high';
  else if (points >= 3) level = 'medium';

  return { points, level };
}

// Load board endpoint
router.post('/api/load-board', async (req, res) => {
  try {
    const { cik, companyName, ticker } = req.body;
    console.log('Loading board for:', companyName, 'CIK:', cik);
    const cikNum = String(cik).replace(/[^0-9]/g,'');
    
    const payload = { 
      query: `cik:${cikNum}`, 
      from: 0, 
      size: 1, 
      sort: [{ filedAt: { order: 'desc' } }] 
    };
    
    const url = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const response = await fetch(url, {
      method:'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify(payload)
    });
    
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const data = await response.json();
    const arr = (data && (data.data || data.records || []));
    
    if(!Array.isArray(arr) || arr.length === 0) { 
      throw new Error("No board data found in filings."); 
    }
    
    const rec = arr[0];
    const dirs = rec.directors || rec.members || [];
    
    if (dirs.length === 0) { 
      throw new Error("No directors listed in the most recent filing."); 
    }
    
    console.log('Found directors:', dirs.length);
    
    const scorePromises = dirs.map(d => calculateLiteScore(d, cikNum));
    const scores = await Promise.all(scorePromises);
    
    res.json({ dirs, scores });
    
  } catch (error) {
    console.error('Error in /api/load-board:', error);
    res.status(500).json({ error: error.message });
  }
});

// FIXED Person details endpoint - THIS IS THE KEY FIX
router.post('/api/person-details', async (req, res) => {
  try {
    const { cik, personName } = req.body;
    const cikNum = String(cik).replace(/[^0-9]/g,'');
    
    console.log('Getting person details for:', personName, 'at company CIK:', cikNum);
    
    // 1. Fetch person details from directors dataset
    const safe = String(personName || '').replace(/"/g,'\"');
    const payload = {
      query: `cik:${cikNum} AND directors.name:"${safe}"`,
      from: 0,
      size: 10,
      sort: [{ filedAt: { order: 'desc' } }]
    };
    
    const url = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const response = await fetch(url, { 
      method: 'POST', 
      headers: {'Content-Type': 'application/json'}, 
      body: JSON.stringify(payload)
    });
    
    let person = { name: personName };
    
    if (response.ok) {
      const data = await response.json();
      const arr = (data && (data.data || data.records || [])) || [];
      
      const targetName = (personName || '').toLowerCase();
      for (const r of arr) {
        const ds = r.directors || r.members || [];
        const match = ds.find(x => (x.name || '').toLowerCase() === targetName);
        if (match) { 
          person = match; 
          break; 
        }
      }
    }
    
    // 2. Find insider CIK from Form 3/4/5 filings
    let insiderCik = null;
    const targetName = personName.toLowerCase().trim();
    
    for (let batch = 0; batch < 4; batch++) {
      const fromValue = batch * 50;
      console.log(`Searching for insider CIK - batch ${batch + 1}`);
      
      const query = `formType:(3 OR 4 OR 5) AND cik:${cikNum}`;
      const searchPayload = {
        query: query,
        from: String(fromValue),
        size: "50",
        sort: [{ "filedAt": { "order": "desc" } }]
      };
      
      const filingUrl = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
      const filingRes = await fetch(filingUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(searchPayload)
      });
      
      if (!filingRes.ok) continue;
      
      const filingData = await filingRes.json();
      
      if (filingData && filingData.filings && filingData.filings.length > 0) {
        for (const filing of filingData.filings) {
          // Check entities for the person's name
          if (filing.entities && filing.entities.length > 1) {
            for (let i = 1; i < filing.entities.length; i++) {
              const entity = filing.entities[i];
              const entityName = (entity.companyName || '').toLowerCase();
              
              if (entityName.includes(targetName) || 
                  entityName.includes(targetName.split(' ')[0]) || 
                  entityName.includes(targetName.split(' ').pop())) {
                if (entity.cik) {
                  console.log(`Found insider CIK:`, entity.cik);
                  insiderCik = String(entity.cik).replace(/[^0-9]/g,'');
                  break;
                }
              }
            }
          }
          if (insiderCik) break;
        }
        if (insiderCik) break;
        if (filingData.filings.length < 50) break;
      } else {
        break;
      }
    }
    
    console.log('Found insider CIK:', insiderCik);
    
    // 3. Load insider trades if we have the CIK
    let tradesSection = [];
    if (insiderCik) {
      console.log('Loading insider trades for CIK:', insiderCik);
      
      const tradesQuery = `formType:(3 OR 4 OR 5) AND entities.cik:${insiderCik}`;
      const tradesPayload = {
        query: tradesQuery,
        from: "0",
        size: "20",
        sort: [{ "filedAt": { "order": "desc" } }]
      };
      
      const tradesUrl = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
      const tradesRes = await fetch(tradesUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(tradesPayload)
      });
      
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json();
        if (tradesData && tradesData.filings && tradesData.filings.length > 0) {
          tradesSection = tradesData.filings.map(filing => ({
            formType: filing.formType || 'Form',
            filedAt: filing.filedAt,
            linkToFilingDetails: filing.linkToFilingDetails || filing.linkToHtml || '#',
            ticker: filing.ticker || '',
            companyName: filing.companyNameLong || filing.companyName || ''
          }));
          console.log('Found trades:', tradesSection.length);
        }
      }
    }
    
    // 4. Fetch other boards
    console.log('Fetching other boards...');
    const otherBoards = [];
    
    const otherBoardsPayload = { 
      query: `directors.name:"${safe}"`, 
      from: 0, 
      size: 50, 
      sort: [{ filedAt: { order: 'desc' } }] 
    };
    
    const otherBoardsUrl = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const otherBoardsRes = await fetch(otherBoardsUrl, { 
      method: 'POST', 
      headers: {'Content-Type': 'application/json'}, 
      body: JSON.stringify(otherBoardsPayload)
    });
    
    if (otherBoardsRes.ok) {
      const otherBoardsData = await otherBoardsRes.json();
      const arr = (otherBoardsData && (otherBoardsData.data || otherBoardsData.records || [])) || [];
      const seen = new Set();
      
      for (const r of arr) {
        const boardCik = String(r.cik || r.entityCik || r.companyCik || '').replace(/[^0-9]/g,'');
        if (!boardCik || seen.has(boardCik)) continue;
        seen.add(boardCik);
        
        const name = r.entityName || r.companyName || r.issuerName || r.name || 'Unknown';
        const ticker = r.ticker || (Array.isArray(r.tickers) ? r.tickers[0] : '');
        
        if (cikNum && String(cikNum) === boardCik) continue;
        otherBoards.push({cik: boardCik, name, ticker});
      }
    }
    
    console.log('Found other boards:', otherBoards.length);
    
    // Return all the data
    res.json({
      person,
      insiderCik,
      otherBoards,
      tradesSection
    });
    
  } catch (error) {
    console.error('Error in /api/person-details:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;