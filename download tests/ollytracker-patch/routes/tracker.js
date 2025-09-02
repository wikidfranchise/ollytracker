// routes/tracker.js
const express = require('express');
const router = express.Router();

router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Node 18+ has global fetch; provide a small wrapper w/ timeout and fallback
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

// Render page
router.get('/tracker', (req, res) => {
  res.render('tracker', { title: 'OllyTracker – Company Lookup → OLLYCARD' });
});

// ENV
const SECAPI_TOKEN  = process.env.SECAPI_TOKEN;
const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN;

if (!SECAPI_TOKEN || !FINNHUB_TOKEN) {
  console.warn('[OllyTracker] Missing SECAPI_TOKEN and/or FINNHUB_TOKEN in environment.');
}

// ---------- LOOKUP ----------
router.get('/api/lookup', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    // try ticker
    const byTicker = `https://api.sec-api.io/mapping/ticker/${encodeURIComponent(q)}?token=${SECAPI_TOKEN}`;
    let r = await fetchWithTimeout(byTicker);
    if (!r.ok) {
      // try name
      const byName = `https://api.sec-api.io/mapping/name/${encodeURIComponent(q)}?token=${SECAPI_TOKEN}`;
      r = await fetchWithTimeout(byName);
      if (!r.ok) return res.json([]);
      const arr = await r.json();
      return res.json(Array.isArray(arr) ? arr.slice(0, 50) : []);
    }
    const arr = await r.json();
    const filtered = Array.isArray(arr) ? arr.filter(x => x.ticker && x.ticker.toLowerCase().includes(String(q).toLowerCase())) : [];
    res.json(filtered.slice(0, 50));
  } catch (e) {
    console.error('Error /api/lookup:', e);
    res.json([]);
  }
});

// ---------- QUOTE ----------
router.get('/api/quote', async (req, res) => {
  try {
    const { ticker } = req.query;
    if (!ticker) return res.status(400).json({ error: 'Ticker required' });
    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_TOKEN}`;
    const r = await fetchWithTimeout(url);
    const data = await r.json();
    res.json(data || {});
  } catch (e) {
    console.error('Error /api/quote:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- PROFILE ----------
router.get('/api/profile', async (req, res) => {
  try {
    const { ticker } = req.query;
    if (!ticker) return res.status(400).json({ error: 'Ticker required' });
    const url = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_TOKEN}`;
    const r = await fetchWithTimeout(url);
    const data = await r.json();
    res.json(data || {});
  } catch (e) {
    console.error('Error /api/profile:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- OLLY SCORE (lite) ----------
async function calculateLiteScore(director) {
  let points = 0;
  try {
    const p = String(director.position || '').toLowerCase();
    if (p.includes('ceo') || p.includes('chief executive') ||
        p.includes('cfo') || p.includes('chief financial') ||
        p.includes('coo') || p.includes('chief operating') ||
        p.includes('president')) {
      points += 3;
    } else if (p.includes('chairman') || p.includes('chair')) {
      points += 2;
    } else {
      points += 1;
    }
  } catch(_) {}
  let level = 'low';
  if (points >= 5) level = 'high';
  else if (points >= 3) level = 'medium';
  return { points, level };
}

// ---------- LOAD BOARD ----------
router.post('/api/load-board', async (req, res) => {
  try {
    const { cik, companyName, ticker } = req.body || {};
    const cikNum = String(cik || '').replace(/[^0-9]/g,'');
    if (!cikNum) return res.status(400).json({ error: 'CIK required' });

    const payload = { query: `cik:${cikNum}`, from: 0, size: 1, sort: [{ filedAt: { order: 'desc' } }] };
    const url = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const r = await fetchWithTimeout(url, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const arr = json?.data || json?.records || [];
    if (!Array.isArray(arr) || arr.length===0) throw new Error('No board data found.');

    const rec = arr[0];
    const dirs = rec.directors || rec.members || [];
    if (!Array.isArray(dirs) || dirs.length===0) throw new Error('No directors reported.');

    const scores = await Promise.all(dirs.map(d => calculateLiteScore(d)));
    res.json({ dirs, scores });
  } catch (e) {
    console.error('Error /api/load-board:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- PERSON DETAILS ----------
router.post('/api/person-details', async (req, res) => {
  try {
    const { cik, personName } = req.body || {};
    const cikNum = String(cik || '').replace(/[^0-9]/g,'');
    const name = String(personName || '').trim();
    if (!cikNum || !name) return res.status(400).json({ error: 'CIK and personName required' });

    // 1) person record from directors dataset
    const safe = name.replace(/"/g, '\\"');
    const personPayload = {
      query: `cik:${cikNum} AND directors.name:"${safe}"`,
      from: 0, size: 10, sort: [{ filedAt: { order: 'desc' } }]
    };
    const dirUrl = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const dirRes = await fetchWithTimeout(dirUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(personPayload)
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

    // 2) insider CIK from 3/4/5 filings for this company
    let insiderCik = null;
    const targetLower = name.toLowerCase();
    for (let batch = 0; batch < 4 && !insiderCik; batch++) {
      const fromValue = batch * 50;
      const query = `formType:(3 OR 4 OR 5) AND cik:${cikNum}`;
      const searchPayload = { query, from: String(fromValue), size: '50', sort: [{ filedAt: { order: 'desc' } }] };
      const filingUrl = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
      const filingRes = await fetchWithTimeout(filingUrl, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(searchPayload)
      });
      if (!filingRes.ok) break;
      const filingData = await filingRes.json();
      const filings = filingData?.filings || [];
      for (const f of filings) {
        const entities = f.entities || [];
        for (let i = 1; i < entities.length; i++) {
          const entity = entities[i];
          const entityName = String(entity.companyName || entity.name || '').toLowerCase();
          if (entityName.includes(targetLower) ||
              entityName.includes(targetLower.split(' ')[0]) ||
              entityName.includes(targetLower.split(' ').slice(-1)[0])) {
            if (entity.cik) { insiderCik = String(entity.cik).replace(/[^0-9]/g,''); break; }
          }
        }
        if (insiderCik) break;
      }
      if ((filings || []).length < 50) break;
    }

    // 3) insider trades for that insider CIK
    let tradesSection = [];
    if (insiderCik) {
      const tradesQuery = `formType:(3 OR 4 OR 5) AND entities.cik:${insiderCik}`;
      const tradesPayload = { query: tradesQuery, from: '0', size: '20', sort: [{ filedAt: { order: 'desc' } }] };
      const tradesUrl = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
      const tradesRes = await fetchWithTimeout(tradesUrl, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tradesPayload)
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

    // 4) Other boards
    const otherBoards = [];
    const otherBoardsPayload = { query: `directors.name:"${name.replace(/"/g,'\\"')}"`, from: 0, size: 50, sort: [{ filedAt: { order: 'desc' } }] };
    const otherBoardsUrl = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const otherRes = await fetchWithTimeout(otherBoardsUrl, {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(otherBoardsPayload)
    });
    if (otherRes.ok) {
      const ob = await otherRes.json();
      const arr = ob?.data || ob?.records || [];
      const seen = new Set();
      for (const r of arr) {
        const boardCik = String(r.cik || r.entityCik || r.companyCik || '').replace(/[^0-9]/g,'');
        if (!boardCik || seen.has(boardCik) || boardCik === cikNum) continue;
        seen.add(boardCik);
        const name = r.entityName || r.companyName || r.issuerName || r.name || 'Unknown';
        const ticker = r.ticker || (Array.isArray(r.tickers) ? r.tickers[0] : '');
        otherBoards.push({ cik: boardCik, name, ticker });
      }
    }

    res.json({ person, insiderCik, otherBoards, tradesSection });
  } catch (e) {
    console.error('Error /api/person-details:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- VERIFY BOARD (latest DEF 14A-backed list) ----------
router.post('/api/verify-board', async (req, res) => {
  try {
    const { cik } = req.body || {};
    const cikNum = String(cik || '').replace(/[^0-9]/g,'');
    if (!cikNum) return res.status(400).json({ error: 'CIK required' });

    const payload = { query: `cik:${cikNum}`, from: 0, size: 1, sort: [{ filedAt: { order: 'desc' } }] };
    const url = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const r = await fetchWithTimeout(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    const arr = json?.data || json?.records || [];
    if (!Array.isArray(arr) || arr.length === 0) return res.json({ currentNames: [], filedAt: null });

    const rec = arr[0];
    const filedAt = rec.filedAt || rec.periodOfReport || null;
    const ds = rec.directors || rec.members || [];
    const currentNames = ds.map(x => x.name).filter(Boolean);
    res.json({ currentNames, filedAt });
  } catch (e) {
    console.error('Error /api/verify-board:', e);
    res.status(500).json({ error: e.message });
  }
});

// ---------- VERIFY OTHER BOARDS (is this person still on each board?) ----------
router.post('/api/verify-other-boards', async (req, res) => {
  try {
    const { boards = [], personName } = req.body || {};
    const name = String(personName || '').trim();
    if (!name) return res.status(400).json({ error: 'personName required' });

    const safe = name.replace(/"/g,'\\"');
    const tasks = boards.map(async (b) => {
      const cikNum = String(b.cik || '').replace(/[^0-9]/g,'');
      if (!cikNum) return null;
      const payload = { query: `cik:${cikNum}`, from: 0, size: 1, sort: [{ filedAt: { order: 'desc' } }] };
      const url = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
      const r = await fetchWithTimeout(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!r.ok) return null;
      const json = await r.json();
      const arr = json?.data || json?.records || [];
      if (!Array.isArray(arr) || arr.length===0) return null;
      const ds = arr[0].directors || arr[0].members || [];
      const names = new Set(ds.map(x => String(x.name||'').toLowerCase()));
      return names.has(name.toLowerCase()) ? cikNum : null;
    });

    const results = await Promise.allSettled(tasks);
    const activeCiks = results.map(r => (r.status==='fulfilled'?r.value:null)).filter(Boolean);
    res.json({ activeCiks, checkedAt: new Date().toISOString() });
  } catch (e) {
    console.error('Error /api/verify-other-boards:', e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
