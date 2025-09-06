// routes/tracker.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

// ✅ parse JSON for POSTs to /api/*
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Test page (EJS view named "tracker")
router.get('/tracker', (req, res) => {
  console.log('TRACKER ROUTE HIT!');
  res.render('tracker', { title: 'OllyTracker — Company Lookup → OLLYCARD' });
});

// ENV
const SECAPI_TOKEN = process.env.SECAPI_TOKEN;
if (!SECAPI_TOKEN) {
  console.warn('[OllyTracker] Missing SECAPI_TOKEN in environment.');
}

const delay = ms => new Promise(res => setTimeout(res, ms));

async function fetchApi(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`API returned status ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

// Helper function to transform DEF14A name to "LAST FIRST MI" format, stripping prefixes/suffixes/punctuation
function transformToEdgarFormat(name) {
  if (!name) return '';
  
  // Remove prefixes like Dr., Mr., Ms., etc.
  const prefixes = /^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|Rev\.|Hon\.|Sir|Dame|)/i;
  name = name.replace(prefixes, '').trim();
  
  // Remove suffixes like Jr., Sr., III, etc. (assuming not in Apple names, but for generality)
  const suffixes = /(Jr\.|Sr\.|III|II|IV|Esq\.|PhD|MBA|MD)$/i;
  name = name.replace(suffixes, '').trim();
  
  // Strip punctuation, apostrophes, etc.
  name = name.replace(/[^a-zA-Z ]/g, '').trim();
  
  // Uppercase
  name = name.toUpperCase();
  
  // Split into parts
  const parts = name.split(/\s+/);
  
  if (parts.length < 2) return name;
  
  // Last name is the last part, rest is first/middle
  const last = parts.pop();
  const firstMiddle = parts.join(' ');
  
  return `${last} ${firstMiddle}`;
}

// -------------------- API ROUTES --------------------

// This route is called by the frontend search box to get company suggestions
router.get('/api/lookup-company', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const url = `https://api.sec-api.io/mapping/ticker/${q}?token=${SECAPI_TOKEN}`;
    const data = await fetchApi(url);

    // Prioritize non-delisted, major exchange stocks
    const sortedData = data.sort((a, b) => {
      const scoreA = (a.isDelisted ? 10 : 0) + (a.exchange === 'NYSE' || a.exchange === 'NASDAQ' ? 0 : 1);
      const scoreB = (b.isDelisted ? 10 : 0) + (b.exchange === 'NYSE' || b.exchange === 'NASDAQ' ? 0 : 1);
      return scoreA - scoreB;
    });

    res.json(sortedData.slice(0, 50));
  } catch (err) {
    console.error('Error in /api/lookup-company:', err.message);
    res.status(500).json({ error: 'Failed to lookup company' });
  }
});

// Helper function to find related CIKs from spinoffs/mergers
async function findRelatedCiks(primaryCik, companyName) {
  const relatedCiks = new Set();
  relatedCiks.add(primaryCik); // Always include the primary CIK
  
  console.log(`🔎 Searching for spinoffs/mergers related to CIK ${primaryCik}`);
  
  try {
    // Use Filing Query API to search for 8-K filings with restructuring items
    const filingQueryUrl = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
    
    // Search for 8-Ks with Items 1.02, 2.01, or 8.01 (restructuring events)
    const searchPayload = {
      query: `cik:${primaryCik} AND formType:"8-K" AND (items:"1.02" OR items:"2.01" OR items:"8.01")`,
      from: "0",
      size: "50",
      sort: [{ "filedAt": { "order": "desc" } }]
    };
    
    const response = await fetchApi(filingQueryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchPayload)
    });
    
    // Parse the filings to extract related CIKs from entities
    if (response.filings && response.filings.length > 0) {
      console.log(`    Found ${response.filings.length} 8-K filings with restructuring events`);
      
      response.filings.forEach((filing, idx) => {
        const entityCount = filing.entities?.length || 0;
        console.log(`    8-K #${idx + 1} filed ${filing.filedAt}: ${entityCount} entities`);
        
        // Check all entities mentioned in the filing
        if (filing.entities && filing.entities.length > 0) {
          filing.entities.forEach(entity => {
            if (entity.cik) {
              const cleanCik = String(entity.cik).replace(/^0+/, '');
              if (cleanCik !== primaryCik) {
                relatedCiks.add(cleanCik);
                console.log(`    ✓ Found related CIK from 8-K filing: ${cleanCik} (${entity.companyName})`);
              }
            }
          });
        }
      });
      
      console.log(`    Total unique related CIKs found: ${relatedCiks.size - 1}`); // -1 because primary is in there
    }
    
    // For Alcoa specifically, we know about these relationships
    if (primaryCik === '1675149') { // Current Alcoa
      relatedCiks.add('4281'); // Old Alcoa Inc (pre-2016)
      relatedCiks.add('1701605'); // Arconic (spinoff)
      console.log('    Added known Alcoa historical CIKs: 4281 (old Alcoa), 1701605 (Arconic)');
    }
    
  } catch (err) {
    console.error('Error finding related CIKs:', err.message);
  }
  
  return Array.from(relatedCiks);
}

// Helper function to get all board members with CIKs from Form 3/4/5 filings
async function getAllBoardMembersWithCiks(primaryCik, companyName) {
  // Step 1: Find all related CIKs (spinoffs, predecessors, etc.)
  const allCiks = await findRelatedCiks(primaryCik, companyName);
  console.log(`📊 Total CIKs to search: ${allCiks.length} - [${allCiks.join(', ')}]`);
  
  // Step 2: Search Form 3/4/5 filings for each CIK using the insider-trading endpoint
  const insiderTradingUrl = `https://api.sec-api.io/insider-trading?token=${SECAPI_TOKEN}`;
  const allDirectors = new Map(); // Use Map to prevent duplicates by insider CIK
  const corporateIdentifiers = /\b(LLC|LP|INC|CORP|TRUST|FUND)\b/i;
  
  for (const searchCik of allCiks) {
    // Add delay before each CIK search to avoid 429 error
    if (allCiks.indexOf(searchCik) > 0) {
      await delay(3000); // 3 second delay between CIKs
    }
    console.log(`🔎 Searching Form 3/4/5 filings for CIK: ${searchCik}`);
    
    const allTransactions = [];
    const size = 50; // Honor the 50 record limit
    let from = 0;
    let hasMore = true;

    while (hasMore && from < 100000) { // Deeper for old companies (2000 pages max)
      const searchPayload = {
        query: `issuer.cik:${searchCik} AND (documentType:"3" OR documentType:"4" OR documentType:"5") AND reportingOwner.relationship.isDirector:true AND filedAt:[2009-01-01 TO *]`,
        from: from.toString(),
        size: size.toString(),
        sort: [{ "filedAt": { "order": "desc" } }]
      };

      try {
        const response = await fetchApi(insiderTradingUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchPayload)
        });

        if (response.transactions && response.transactions.length > 0) {
          allTransactions.push(...response.transactions);
          console.log(`    Retrieved ${response.transactions.length} Form 3/4/5 filings (from: ${from})`);
          
          // Check if we need to paginate
          if (response.transactions.length === size) {
            from += size;
            await delay(500); // Delay per page to respect API limits
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
          if (from === 0) {
            console.log(`    No Form 3/5 filings found for CIK ${searchCik}`);
          }
        }
      } catch (err) {
        console.error(`    Error fetching Form 3/4/5: ${err.message}`);
        hasMore = false;
      }
    }

    console.log(`    Total Form 3/4/5 filings found for CIK ${searchCik}: ${allTransactions.length}`);

    // Process transactions to extract board members
    for (const transaction of allTransactions) {
      if (transaction.reportingOwner) {
        const owner = transaction.reportingOwner;
        if (owner.cik && owner.name) {
          const insiderCik = String(owner.cik).replace(/^0+/, '');
          const rawName = owner.name.trim();
          
          // Only include individuals, not corporate entities
          if (!corporateIdentifiers.test(rawName.toUpperCase())) {
            // Check if this person is a director
            const relationship = owner.relationship || {};
            if (relationship.isDirector && !allDirectors.has(insiderCik)) {
              // Get the issuer name for this filing
              const issuerName = transaction.issuer ? transaction.issuer.name : `CIK: ${searchCik}`;
              
              allDirectors.set(insiderCik, {
                rawName: rawName, // Original EDGAR name "LAST FIRST MI"
                cik: insiderCik,
                filedUnderCik: searchCik,
                filedUnderCompany: searchCik === primaryCik ? companyName : issuerName,
                filingDate: transaction.filedAt,
                earliestReportDate: transaction.periodOfReport, // For validation later
                isDirector: true,
                isOfficer: relationship.isOfficer || false,
                officerTitle: relationship.officerTitle || '',
                isTenPercentOwner: relationship.isTenPercentOwner || false,
                isCurrent: searchCik === primaryCik  // Mark if they're from the current company
              });
            }
          }
        }
      }
    }
  }
  
  // Convert Map to array for response
  const directors = Array.from(allDirectors.values());
  console.log(`✅ Found ${directors.length} unique board members across all entities`);
  
  return directors;
}

// -------------------- BOARD HISTORY (ALL INSIDERS) --------------------
router.post('/api/load-board', async (req, res) => {
  try {
    const { cik, companyName } = req.body;
    if (!cik) {
      return res.status(400).json({ error: 'Company CIK is required.' });
    }

    console.log(`✅ Finding board members for ${companyName} (CIK: ${cik})`);
    
    // Get all board members with CIKs
    const directors = await getAllBoardMembersWithCiks(cik, companyName);
    
    // Sort by name for consistent display
    directors.sort((a, b) => a.rawName.localeCompare(b.rawName));
    
    // Debug: Check what related CIKs were found
    const allCiks = await findRelatedCiks(cik, companyName);
    console.log(`    🔌 Final related CIKs for display: ${allCiks.length} - [${allCiks.join(', ')}]`);
    
    res.json({ 
      directors: directors,
      searchedCiks: allCiks 
    });

  } catch (err) {
    console.error('Error in /api/load-board:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// -------------------- CURRENT BOARD WITH DIRECT QUERY --------------------
router.post('/api/current-board', async (req, res) => {
  try {
    const { cik, companyName } = req.body;
    if (!cik) return res.status(400).json({ error: 'Company CIK is required.' });

    const companyCik = String(cik).replace(/^0+/, '');
    console.log(`\n✅ Pulling CURRENT board (DEF14A) for ${companyName} (CIK: ${companyCik})`);

    // Step 1: Get latest DEF14A directors
    const directorsUrl = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
    const directorsPayload = {
      query: `cik:${companyCik}`,
      from: 0,
      size: 1,
      sort: [{ filedAt: { order: "desc" } }]
    };

    const directorsRes = await fetch(directorsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(directorsPayload)
    });

    if (!directorsRes.ok) throw new Error(`HTTP ${directorsRes.status}`);
    const directorsData = await directorsRes.json();
    
    const filings = directorsData?.data || [];
    if (!filings.length) {
      return res.json({ 
        directors: [], 
        message: 'No DEF14A directors data found for this company' 
      });
    }

    const latestFiling = filings[0];
    const proxyDate = latestFiling.filedAt;
    const def14aDirectors = latestFiling.directors || [];

    console.log(`    Found ${def14aDirectors.length} directors from DEF14A filed ${proxyDate}`);

    // Step 2: For each director, transform name and query directly
    const matchedDirectors = [];
    const insiderTradingUrl = `https://api.sec-api.io/insider-trading?token=${SECAPI_TOKEN}`;
    const seenNames = new Set(); // To handle duplicates like Wanda Austin
    
    for (const director of def14aDirectors) {
      const directorName = director.name || '';
      
      // Skip titles or empty
      if (!directorName || /^(CEO|CFO|President|Chairman|Director)$/i.test(directorName)) {
        console.log(`    ⚠️ Skipping invalid name: "${directorName}"`);
        continue;
      }
      
      const transformedName = transformToEdgarFormat(directorName);
      if (seenNames.has(transformedName)) {
        console.log(`    ⚠️ Skipping duplicate: "${directorName}" -> "${transformedName}"`);
        continue;
      }
      seenNames.add(transformedName);
      
      const sinceYear = director.dateFirstElected ? parseInt(director.dateFirstElected.match(/\d{4}/)?.[0] || 0) : 0;
      
      console.log(`\n    📋 Querying for "${directorName}" as "${transformedName}" (since: ${sinceYear || 'N/A'})`);
      
      // Direct query using transformed name with wildcard for MI
      let cik = null;
      let secName = null;
      let earliestYear = null;
      let hasMore = true;
      let from = 0;
      const size = 50;
      const maxPages = 20;

      while (hasMore && from < (maxPages * size)) {
        const payload = {
          query: `issuer.cik:${companyCik} AND reportingOwner.name:\"${transformedName}*\" AND reportingOwner.relationship.isDirector:true AND filedAt:[2009-01-01 TO *]`,
          from: from.toString(),
          size: size.toString(),
          sort: [{ "filedAt": { "order": "desc" } }]
        };

        try {
          const response = await fetchApi(insiderTradingUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (response.transactions && response.transactions.length > 0) {
            const transaction = response.transactions[0];
            const owner = transaction.reportingOwner;
            if (owner.cik) {
              cik = String(owner.cik).replace(/^0+/, '');
              secName = owner.name;
              earliestYear = transaction.periodOfReport.split('-')[0];
              
              let yearDiff = sinceYear && earliestYear ? Math.abs(sinceYear - parseInt(earliestYear)) : 0;
              if (sinceYear < 2009 && parseInt(earliestYear) >= 2009) {
                yearDiff = 0;
              }
              if (yearDiff <= 5) {
                console.log(`    ✅ MATCHED! "${secName}" (CIK: ${cik}, Year: ${earliestYear})`);
                break;
              } else {
                console.log(`    ⚠️ Year mismatch (Diff: ${yearDiff}) - Continuing search`);
              }
            }
            
            if (response.transactions.length === size) {
              from += size;
              await delay(500);
            } else {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        } catch (err) {
          console.error(`    Error in search: ${err.message}`);
          hasMore = false;
        }
      }

      matchedDirectors.push({
        name: directorName,
        position: director.position || 'Director',
        age: director.age || null,
        since: director.dateFirstElected || director.since || '',
        committees: director.committeeMemberships || [],
        cik: cik || null,
        cikVerified: !!cik,
        matchMethod: cik ? 'Direct Edgar Format Search' : 'No Match Found',
        secName: secName || null,
        isDuplicate: false
      });
    }

    // Summary
    const verifiedCount = matchedDirectors.filter(d => d.cikVerified).length;
    const noMatchCount = matchedDirectors.filter(d => !d.cik).length;
    
    console.log(`\n    ✅ FINAL SUMMARY:`);
    console.log(`       Total Directors: ${matchedDirectors.length}`);
    console.log(`       CIKs Found: ${verifiedCount}`);
    console.log(`       No Match: ${noMatchCount}`);

    res.json({
      directors: matchedDirectors,
      proxyFiledAt: proxyDate,
      totalDirectors: matchedDirectors.length,
      verifiedCiks: verifiedCount,
      duplicates: 0,
      noCikFound: noMatchCount,
      source: 'Latest DEF14A proxy statement',
      matchingMethod: 'Direct query with transformed Last First MI format'
    });

  } catch (err) {
    console.error('Error in /api/current-board:', err.message);
    res.status(500).json({ error: 'Failed to load current board data' });
  }
});

// -------------------- PERSON DETAILS --------------------
router.post('/api/person-details', async (req, res) => {
  const { personName, personCik, companyFiledUnder } = req.body;
  
  // This will be expanded to show all Form 3,4,5 filings for this person
  res.json({
    person: {
      name: personName,
      cik: personCik,
      filedUnder: companyFiledUnder,
      position: 'Board Member / Insider',
    },
    insiderTrades: [],
    otherBoards: []
  });
});

module.exports = router;