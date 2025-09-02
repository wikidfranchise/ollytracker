// routes/tracker.js
const express = require('express');
const router = express.Router();

// ✅ parse JSON for POSTs to /api/*
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// ✅ fetch with timeout (works on Node 18+/20+; falls back to node-fetch if needed)
const _fetch = global.fetch || ((...args) => import('node-fetch').then(m => m.default(...args)));
const fetchWithTimeout = async (url, opts = {}, ms = 15000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await _fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

// Test page (EJS view named "tracker")
router.get('/tracker', (req, res) => {
  console.log('TRACKER ROUTE HIT!');
  res.render('tracker', { title: 'OllyTracker – Company Lookup → OLLYCARD' });
});

// Quick health check
router.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    secToken: Boolean(process.env.SECAPI_TOKEN),
    finnhubToken: Boolean(process.env.FINNHUB_TOKEN)
  });
});

// ENV
const SECAPI_TOKEN   = process.env.SECAPI_TOKEN;
const FINNHUB_TOKEN  = process.env.FINNHUB_TOKEN;

if (!SECAPI_TOKEN || !FINNHUB_TOKEN) {
  console.warn('[OllyTracker] Missing SECAPI_TOKEN and/or FINNHUB_TOKEN in environment.');
}

// -------------------- LOOKUP --------------------
router.get('/api/lookup', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const byTicker = `https://api.sec-api.io/mapping/ticker/${encodeURIComponent(q)}?token=${SECAPI_TOKEN}`;
    let response = await fetchWithTimeout(byTicker);

    if (!response.ok) {
      // try by name
      const byName = `https://api.sec-api.io/mapping/name/${encodeURIComponent(q)}?token=${SECAPI_TOKEN}`;
      const response2 = await fetchWithTimeout(byName);
      if (!response2.ok) return res.json([]);
      const data2 = await response2.json();
      return res.json(Array.isArray(data2) ? data2.slice(0, 50) : []);
    }

    const data = await response.json();
    const filtered = Array.isArray(data)
      ? data.filter(r => r.ticker && r.ticker.toLowerCase().includes(q.toLowerCase()))
      : [];
    res.json(filtered.slice(0, 50));
  } catch (err) {
    console.error('Error /api/lookup:', err);
    res.json([]);
  }
});

// -------------------- QUOTE --------------------
router.get('/api/quote', async (req, res) => {
  try {
    const { ticker } = req.query;
    if (!ticker) return res.status(400).json({ error: 'Ticker required' });

    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_TOKEN}`;
    const r = await fetchWithTimeout(url);
    const data = await r.json();
    res.json(data || {});
  } catch (err) {
    console.error('Error /api/quote:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------- PROFILE --------------------
router.get('/api/profile', async (req, res) => {
  try {
    const { ticker } = req.query;
    if (!ticker) return res.status(400).json({ error: 'Ticker required' });

    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_TOKEN}`;
    const r = await fetchWithTimeout(url);
    const data = await r.json();
    res.json(data || {});
  } catch (err) {
    console.error('Error /api/profile:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------- OLLY SCORE --------------------
async function calculateLiteScore(director) {
  let points = 0;
  try {
    const position = String(director.position || '').toLowerCase();
    if (
      position.includes('ceo') || position.includes('chief executive') ||
      position.includes('cfo') || position.includes('chief financial') ||
      position.includes('coo') || position.includes('chief operating') ||
      position.includes('president')
    ) {
      points += 3;
    } else if (position.includes('chairman') || position.includes('chair')) {
      points += 2;
    } else {
      points += 1;
    }
  } catch (e) {
    console.error('Score error:', e);
  }
  let level = 'low';
  if (points >= 5) level = 'high';
  else if (points >= 3) level = 'medium';
  return { points, level };
}

// -------------------- LOAD BOARD --------------------
router.post('/api/load-board', async (req, res) => {
  try {
    const { cik, companyName } = req.body || {};
    const cikNum = String(cik || '').replace(/[^0-9]/g, '');
    if (!cikNum) return res.status(400).json({ error: 'CIK required' });

    console.log('Loading board for:', companyName || '(unknown)', 'CIK:', cikNum);

    const payload = {
      query: `cik:${cikNum}`,
      from: 0,
      size: 1,
      sort: [{ filedAt: { order: 'desc' } }]
    };

    const url = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const r = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!r.ok) throw new Error(`HTTP ${r.status}`);

    const json = await r.json();
    const arr = json?.data || json?.records || [];
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('No board data found.');

    const rec = arr[0];
    const dirs = rec.directors || rec.members || [];
    if (dirs.length === 0) throw new Error('No directors in the most recent filing.');

    const scores = await Promise.all(dirs.map(d => calculateLiteScore(d)));
    res.json({ dirs, scores });
  } catch (err) {
    console.error('Error /api/load-board:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------- PERSON DETAILS --------------------
router.post('/api/person-details', async (req, res) => {
  try {
    const { cik, personName } = req.body || {};
    const cikNum = String(cik || '').replace(/[^0-9]/g, '');
    const name = String(personName || '').trim();
    if (!cikNum || !name) return res.status(400).json({ error: 'CIK and personName required' });

    console.log('Person details for:', name, 'CIK:', cikNum);

    // 1) person record from directors dataset
    const safe = name.replace(/"/g, '\\"');
    const personPayload = {
      query: `cik:${cikNum} AND directors.name:"${safe}"`,
      from: 0,
      size: 10,
      sort: [{ filedAt: { order: 'desc' } }]
    };
    const dirUrl = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const dirRes = await fetchWithTimeout(dirUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(personPayload)
    });

    let person = { name };
    if (dirRes.ok) {
      const json = await dirRes.json();
      const arr = json?.data || json?.records || [];
      const target = name.toLowerCase();
      for (const r of arr) {
        const ds = r.directors || r.members || [];
        const match = ds.find(x => String(x.name || '').toLowerCase() === target);
        if (match) { person = match; break; }
      }
    }

    // 2) insider CIK from 3/4/5
    let insiderCik = null;
    const targetLower = name.toLowerCase();
    for (let batch = 0; batch < 4 && !insiderCik; batch++) {
      const fromValue = batch * 50;
      const query = `formType:(3 OR 4 OR 5) AND cik:${cikNum}`;
      const searchPayload = {
        query,
        from: String(fromValue),
        size: '50',
        sort: [{ filedAt: { order: 'desc' } }]
      };
      const filingUrl = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
      const filingRes = await fetchWithTimeout(filingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchPayload)
      });
      if (!filingRes.ok) break;
      const filingData = await filingRes.json();
      const filings = filingData?.filings || [];
      for (const f of filings) {
        const entities = f.entities || [];
        for (let i = 1; i < entities.length; i++) {
          const entity = entities[i];
          const entityName = String(entity.companyName || entity.name || '').toLowerCase();
          if (
            entityName.includes(targetLower) ||
            entityName.includes(targetLower.split(' ')[0]) ||
            entityName.includes(targetLower.split(' ').slice(-1)[0])
          ) {
            if (entity.cik) {
              insiderCik = String(entity.cik).replace(/[^0-9]/g, '');
              break;
            }
          }
        }
        if (insiderCik) break;
      }
      if (filings.length < 50) break;
    }

    // 3) trades for insider CIK
    let tradesSection = [];
    if (insiderCik) {
      const tradesQuery = `formType:(3 OR 4 OR 5) AND entities.cik:${insiderCik}`;
      const tradesPayload = {
        query: tradesQuery,
        from: '0',
        size: '20',
        sort: [{ filedAt: { order: 'desc' } }]
      };
      const tradesUrl = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
      const tradesRes = await fetchWithTimeout(tradesUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradesPayload)
      });
      if (tradesRes.ok) {
        const t = await tradesRes.json();
        tradesSection = (t?.filings || []).map(f => ({
          formType: f.formType || 'Form',
          filedAt: f.filedAt,
          linkToFilingDetails: f.linkToFilingDetails || f.linkToHtml || '#',
          ticker: f.ticker || '',
          companyName: f.companyNameLong || f.companyName || ''
        }));
      }
    }

    // 4) other boards
    const otherBoards = [];
    const otherBoardsPayload = {
      query: `directors.name:"${safe}"`,
      from: 0,
      size: 50,
      sort: [{ filedAt: { order: 'desc' } }]
    };
    const otherBoardsUrl = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const otherRes = await fetchWithTimeout(otherBoardsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(otherBoardsPayload)
    });
    if (otherRes.ok) {
      const ob = await otherRes.json();
      const arr = ob?.data || ob?.records || [];
      const seen = new Set();
      for (const r of arr) {
        const boardCik = String(r.cik || r.entityCik || r.companyCik || '').replace(/[^0-9]/g, '');
        if (!boardCik || seen.has(boardCik) || boardCik === cikNum) continue;
        seen.add(boardCik);
        const name = r.entityName || r.companyName || r.issuerName || r.name || 'Unknown';
        const ticker = r.ticker || (Array.isArray(r.tickers) ? r.tickers[0] : '');
        otherBoards.push({ cik: boardCik, name, ticker });
      }
    }

    res.json({ person, insiderCik, otherBoards, tradesSection });
  } catch (err) {
    console.error('Error /api/person-details:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
