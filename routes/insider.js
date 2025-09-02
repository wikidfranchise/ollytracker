const express = require('express');
const axios = require('axios');

const router = express.Router();

// ---- ENV + constants ----
const SECAPI_TOKEN = process.env.SECAPI_TOKEN; // REQUIRED
if (!SECAPI_TOKEN) {
  console.warn('[Insider] Missing SECAPI_TOKEN env var');
}
const INSIDER_API = 'https://api.sec-api.io/insider-trading'; // Forms 3/4/5
const FORM144_API = 'https://api.sec-api.io/form-144';        // Form 144

const SEC_HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': SECAPI_TOKEN
};

// Small helper to call SEC API with consistent headers
async function secPost(url, payload) {
  const { data } = await axios.post(url, payload, { headers: SEC_HEADERS, timeout: 20000 });
  return data;
}

// Render page
router.get('/insider', (req, res) => {
  res.render('insider', {
    title: 'OllyInsider™'
  });
});

// POST /api/insider/search
// Body: { q: "AAPL" or "0000320193", startDate: "2024-01-01", endDate: "2024-12-31", forms: ["3","4","5","144"], from: 0, size: 50 }
router.post('/api/insider/search', async (req, res) => {
  try {
    let { q, startDate, endDate, forms, from, size } = req.body || {};
    q = (q || '').trim();
    startDate = startDate || '2005-01-01';
    endDate = endDate || new Date().toISOString().slice(0,10);
    forms = Array.isArray(forms) && forms.length ? forms : ['3','4','5'];
    from = isFinite(+from) ? String(+from) : '0';
    size = isFinite(+size) ? String(+size) : '50';

    // Decide whether user passed ticker (letters) or CIK (digits)
    const isCIK = /^\d{5,}$/.test(q);
    const targetField = isCIK ? 'issuer.cik' : 'issuer.tradingSymbol';
    const cleanedQ = q ? q.toUpperCase() : '*';

    // Build the shared date range
    const dateClause = `filedAt:[${startDate} TO ${endDate}]`;

    // We will make up to 2 calls:
    // 1) Forms 3/4/5 via /insider-trading with documentType:(3 OR 4 OR 5)
    // 2) Form 144 via /form-144 with formType:144
    let results = [];
    let totals = { f345: 0, f144: 0 };

    // If the user asked for any of 3/4/5:
    const wants345 = forms.some(f => ['3','4','5'].includes(f));
    if (wants345) {
      const docTypes = forms.filter(f => ['3','4','5'].includes(f));
      const typeClause = `documentType:(${docTypes.join(' OR ')})`;
      const qClause = cleanedQ === '*'
        ? `${typeClause} AND ${dateClause}`
        : `${targetField}:${cleanedQ} AND ${typeClause} AND ${dateClause}`;

      const payload = {
        query: qClause,
        from,
        size,
        sort: [{ filedAt: { order: 'desc' } }]
      };

      const data = await secPost(INSIDER_API, payload);
      // API may return data in different keys depending on account version
      const items = data.transactions || data.data || data.hits?.hits?.map(h => h._source) || [];
      const total = data.total?.value ?? data.total ?? items.length;
      totals.f345 = Number(total) || 0;

      // Normalize minimally
      const mapped = items.map(it => ({
        kind: '345',
        filedAt: it.filedAt || it.periodOfReport,
        documentType: it.documentType || it.formType || '4',
        issuer: {
          ticker: it.issuer?.tradingSymbol || it.ticker || '',
          cik: it.issuer?.cik || it.cik || '',
          name: it.issuer?.name || it.companyName || ''
        },
        reportingOwner: it.reportingOwner || it.owners || [],
        link: it.linkToFilingDetails || it.linkToAccession || ''
      }));
      results = results.concat(mapped);
    }

    // If the user asked for 144:
    const wants144 = forms.includes('144');
    if (wants144) {
      const qField144 = isCIK ? 'cik' : 'ticker';
      const qClause144 = cleanedQ === '*'
        ? `formType:144 AND ${dateClause}`
        : `${qField144}:${cleanedQ} AND formType:144 AND ${dateClause}`;

      const payload144 = {
        query: qClause144,
        from,
        size,
        sort: [{ filedAt: { order: 'desc' } }]
      };

      const data144 = await secPost(FORM144_API, payload144);
      const items144 = data144.data || data144.hits?.hits?.map(h => h._source) || [];
      const total144 = data144.total?.value ?? data144.total ?? items144.length;
      totals.f144 = Number(total144) || 0;

      const mapped144 = items144.map(it => ({
        kind: '144',
        filedAt: it.filedAt,
        documentType: it.formType || '144',
        issuer: {
          ticker: it.ticker || '',
          cik: it.cik || '',
          name: it.companyName || it.issuer || ''
        },
        reportingOwner: it.reportingOwner || it.owners || [],
        link: it.linkToFilingDetails || it.linkToAccession || it.filingUrl || ''
      }));
      results = results.concat(mapped144);
    }

    // Sort newest first (some accounts already sorted)
    results.sort((a,b) => (b.filedAt || '').localeCompare(a.filedAt || ''));

    res.json({
      query: { q, startDate, endDate, forms, from: Number(from), size: Number(size) },
      totals,
      count: results.length,
      results
    });
  } catch (err) {
    console.error('[Insider] search error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Insider search failed', detail: err?.response?.data || err.message });
  }
});

module.exports = router;
