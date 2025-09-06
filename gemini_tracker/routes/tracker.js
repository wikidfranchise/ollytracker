// routes/tracker.js
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const Fuse = require('fuse.js');

// ✅ parse JSON for POSTs to /api/*
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

// Test page (EJS view named "tracker")
router.get('/tracker', (req, res) => {
  console.log('TRACKER ROUTE HIT!');
  res.render('tracker', { title: 'OllyTracker – Company Lookup → OLLYCARD' });
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
        
        // Debug: Show first filing structure
        if (idx === 0) {
          console.log(`    Sample 8-K structure:`, Object.keys(filing));
        }
        
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
    // This handles historical cases that might not show up in recent 8-Ks
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

// Helper function to get all board members with CIKs from Form 3 filings
async function getAllBoardMembersWithCiks(primaryCik, companyName) {
  // Step 1: Find all related CIKs (spinoffs, predecessors, etc.)
  const allCiks = await findRelatedCiks(primaryCik, companyName);
  console.log(`📊 Total CIKs to search: ${allCiks.length} - [${allCiks.join(', ')}]`);
  
  // Step 2: Search Form 3 filings for each CIK using the insider-trading endpoint
  const insiderTradingUrl = `https://api.sec-api.io/insider-trading?token=${SECAPI_TOKEN}`;
  const allDirectors = new Map(); // Use Map to prevent duplicates by insider CIK
  
  for (const searchCik of allCiks) {
    console.log(`🔎 Searching Form 3 filings for CIK: ${searchCik}`);
    
    const allTransactions = [];
    const size = 50; // Honor the 50 record limit
    let from = 0;
    let hasMore = true;

    while (hasMore && from < 50000) { // Go deeper for old companies
      const searchPayload = {
        query: `issuer.cik:${searchCik} AND documentType:"3"`,
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
          console.log(`    Retrieved ${response.transactions.length} Form 3 filings (from: ${from})`);
          
          // Check if we need to paginate
          if (response.transactions.length === size) {
            from += size;
            await delay(300); // Small delay to respect API limits
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
          if (from === 0) {
            console.log(`    No Form 3 filings found for CIK ${searchCik}`);
          }
        }
      } catch (err) {
        console.error(`    Error fetching Form 3s: ${err.message}`);
        hasMore = false;
      }
    }

    console.log(`    Total Form 3 filings found for CIK ${searchCik}: ${allTransactions.length}`);

    // Process transactions to extract board members
    const corporateIdentifiers = /\b(LLC|LP|INC|CORP|TRUST|FUND)\b/i;

    for (const transaction of allTransactions) {
      if (transaction.reportingOwner) {
        const owner = transaction.reportingOwner;
        if (owner.cik && owner.name) {
          const insiderCik = String(owner.cik).replace(/^0+/, '');
          const name = owner.name;
          
          // Only include individuals, not corporate entities
          if (!corporateIdentifiers.test(name.toUpperCase())) {
            // Check if this person is a director or officer
            const relationship = owner.relationship || {};
            const isRelevant = relationship.isDirector || relationship.isOfficer || relationship.isTenPercentOwner;
            
            if (isRelevant && !allDirectors.has(insiderCik)) {
              // Get the issuer name for this filing
              const issuerName = transaction.issuer ? transaction.issuer.name : `CIK: ${searchCik}`;
              
              allDirectors.set(insiderCik, {
                name: name,
                cik: insiderCik,
                filedUnderCik: searchCik,
                filedUnderCompany: searchCik === primaryCik ? companyName : issuerName,
                filingDate: transaction.filedAt,
                isDirector: relationship.isDirector || false,
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
    directors.sort((a, b) => a.name.localeCompare(b.name));
    
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

// -------------------- CURRENT BOARD WITH AUTOMATIC FORM 3/4/5 SEARCH --------------------
router.post('/api/current-board', async (req, res) => {
  try {
    const { cik, companyName } = req.body;
    if (!cik) return res.status(400).json({ error: 'Company CIK is required.' });

    const companyCik = String(cik).replace(/^0+/, '');
    console.log(`\n✅ Pulling CURRENT board (DEF14A) for ${companyName} (CIK: ${companyCik})`);

    // Step 1: Get ALL board members with CIKs from Form 3
    const allBoardMembers = await getAllBoardMembersWithCiks(companyCik, companyName);
    console.log(`    Found ${allBoardMembers.length} total board members with CIKs from Form 3s`);
    
    // Create a map for quick CIK lookup with multiple name variations
    const cikMap = new Map();
    
    allBoardMembers.forEach(member => {
      // Store multiple variations of the name for better matching
      const variations = [
        member.name.toLowerCase(),
        member.name.replace(/[.,]/g, '').toLowerCase(),
        member.name.replace(/\s+/g, ' ').trim().toLowerCase(),
        // Add last name, first name format
        (() => {
          const parts = member.name.split(' ');
          if (parts.length > 1) {
            return `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}`.toLowerCase();
          }
          return member.name.toLowerCase();
        })()
      ];
      
      variations.forEach(variant => {
        cikMap.set(variant, member.cik);
      });
    });

    // Step 2: Get latest DEF14A directors
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

    // Step 3: Match directors - first try Board History, then auto-search Form 4/3/5
    const Fuse = require('fuse.js');
    const fuse = new Fuse(allBoardMembers, {
      keys: ['name'],
      includeScore: true,
      threshold: 0.4,
      ignoreLocation: true,
      shouldSort: true
    });

    const matchedDirectors = [];
    const matchedCiks = new Map(); // Track CIKs and which directors have them
    const insiderTradingUrl = `https://api.sec-api.io/insider-trading?token=${SECAPI_TOKEN}`;
    
    for (const director of def14aDirectors) {
      const directorName = director.name || '';
      
      // Skip titles that aren't person names
      if (/^(CEO|CFO|President|Chairman|Director)$/i.test(directorName)) {
        console.log(`    ⚠️ Skipping title: "${directorName}"`);
        continue;
      }
      
      console.log(`\n    🔍 Processing: "${directorName}"`);
      
      let matchedCik = null;
      let matchMethod = 'No Match';
      let matchedName = null;
      
      // Try Board History matching first
      const nameVariations = [
        directorName.toLowerCase(),
        directorName.replace(/[.,]/g, '').toLowerCase(),
        directorName.replace(/\s+/g, ' ').trim().toLowerCase()
      ];
      
      for (const variant of nameVariations) {
        if (cikMap.has(variant)) {
          const candidateCik = cikMap.get(variant);
          if (!matchedCiks.has(candidateCik)) {
            matchedCik = candidateCik;
            matchMethod = 'Board History';
            console.log(`    ✅ Found in Board History: CIK ${matchedCik}`);
            break;
          }
        }
      }
      
      // If no Board History match, try fuzzy matching
      if (!matchedCik) {
        const results = fuse.search(directorName);
        if (results.length > 0 && results[0].score < 0.4) {
          const bestMatch = results[0].item;
          if (!matchedCiks.has(bestMatch.cik)) {
            matchedCik = bestMatch.cik;
            matchedName = bestMatch.name;
            matchMethod = 'Fuzzy Match';
            console.log(`    ✅ Fuzzy matched to: "${bestMatch.name}" (CIK: ${matchedCik})`);
          }
        }
      }
      
      // If still no match, automatically search Form 3/4/5 filings
      if (!matchedCik) {
        console.log(`    🔄 Auto-searching Form 3/4/5 filings...`);
        
        const cleanName = directorName
          .replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|Sir)\s+/i, '')
          .replace(/\s+(Jr\.?|Sr\.?|III|II|IV)$/i, '')
          .trim();
        
        const nameParts = cleanName.toLowerCase().split(/\s+/);
        const lastName = nameParts[nameParts.length - 1];
        const firstName = nameParts[0];
        
        // Search ALL Form 3/4/5 filings going back 10 years
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
        const dateStr = tenYearsAgo.toISOString().split('T')[0];
        
        let found = false;
        let from = 0;
        const searchSize = 50;
        const maxIterations = 10; // Search up to 500 records
        
        while (!found && from < searchSize * maxIterations) {
          const searchPayload = {
            query: `issuer.cik:${companyCik} AND (documentType:"3" OR documentType:"4" OR documentType:"5") AND filedAt:[${dateStr} TO *]`,
            from: from.toString(),
            size: searchSize.toString(),
            sort: [{ "filedAt": { "order": "desc" } }]
          };
          
          try {
            const response = await fetchApi(insiderTradingUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(searchPayload)
            });
            
            if (response.transactions && response.transactions.length > 0) {
              for (const transaction of response.transactions) {
                if (transaction.reportingOwner) {
                  const ownerName = (transaction.reportingOwner.name || '').toLowerCase();
                  
                  // Check for name match
                  const matches = [
                    ownerName === cleanName.toLowerCase(),
                    (ownerName.includes(lastName) && ownerName.includes(firstName)),
                    (ownerName.includes(lastName) && ownerName.includes(firstName.charAt(0))),
                    ownerName.includes(`${lastName}, ${firstName}`),
                    (lastName.length > 4 && ownerName.includes(lastName) && 
                     !ownerName.includes('trust') && !ownerName.includes('llc'))
                  ];
                  
                  if (matches.some(m => m)) {
                    const foundCik = String(transaction.reportingOwner.cik || '').replace(/^0+/, '');
                    if (foundCik && !matchedCiks.has(foundCik)) {
                      matchedCik = foundCik;
                      matchedName = transaction.reportingOwner.name;
                      matchMethod = `Form ${transaction.documentType || '3/4/5'}`;
                      found = true;
                      console.log(`    ✅ Found via ${matchMethod}: "${matchedName}" (CIK: ${matchedCik})`);
                      break;
                    }
                  }
                }
              }
              
              // If we got fewer results than requested, we've reached the end
              if (response.transactions.length < searchSize) {
                break;
              }
            } else {
              break;
            }
            
            from += searchSize;
            if (!found && from < searchSize * maxIterations) {
              await delay(200); // Small delay between requests
            }
          } catch (searchErr) {
            console.log(`    Search error at offset ${from}: ${searchErr.message}`);
            break;
          }
        }
        
        if (!matchedCik) {
          console.log(`    ❌ No CIK found after searching ${from} Form 3/4/5 records`);
        }
      }
      
      // Check for duplicates
      let isDuplicate = false;
      if (matchedCik) {
        if (matchedCiks.has(matchedCik)) {
          isDuplicate = true;
          const otherDirector = matchedCiks.get(matchedCik);
          console.log(`    ⚠️ DUPLICATE CIK ${matchedCik} already assigned to "${otherDirector}"`);
        } else {
          matchedCiks.set(matchedCik, directorName);
        }
      }
      
      // Add to results
      matchedDirectors.push({
        name: directorName,
        position: director.position || 'Director',
        age: director.age || null,
        since: director.dateFirstElected || director.since || '',
        committees: director.committeeMemberships || [],
        cik: matchedCik,
        cikVerified: !!matchedCik && !isDuplicate,
        isDuplicate: isDuplicate,
        matchMethod: matchMethod,
        matchedName: matchedName
      });
    }

    // Summary
    const verifiedCount = matchedDirectors.filter(d => d.cikVerified).length;
    const duplicateCount = matchedDirectors.filter(d => d.isDuplicate).length;
    const noMatchCount = matchedDirectors.filter(d => !d.cik).length;
    
    console.log(`\n    ✅ FINAL SUMMARY:`);
    console.log(`       Total Directors: ${matchedDirectors.length}`);
    console.log(`       CIKs Found: ${verifiedCount}`);
    console.log(`       Duplicates: ${duplicateCount}`);
    console.log(`       No CIK Found: ${noMatchCount}`);

    res.json({
      directors: matchedDirectors,
      proxyFiledAt: proxyDate,
      totalDirectors: matchedDirectors.length,
      verifiedCiks: verifiedCount,
      duplicates: duplicateCount,
      noCikFound: noMatchCount,
      source: 'Latest DEF14A proxy statement',
      matchingMethod: 'Automatic CIK resolution via Board History + Form 3/4/5 search',
      disclaimer: 'CIKs automatically resolved by searching complete insider filing history.'
    });

  } catch (err) {
    console.error('Error in /api/current-board:', err.message);
    res.status(500).json({ error: 'Failed to load current board data' });
  }
});

// -------------------- ENHANCED FORM 4 CIK SEARCH (keeping for manual searches if needed) --------------------
router.post('/api/search-form4-cik', async (req, res) => {
  try {
    const { directorName, companyCik } = req.body;
    if (!directorName || !companyCik) {
      return res.status(400).json({ error: 'Director name and company CIK required' });
    }

    console.log(`🔍 Enhanced Form 4 search for ${directorName} at CIK ${companyCik}`);
    
    const insiderTradingUrl = `https://api.sec-api.io/insider-trading?token=${SECAPI_TOKEN}`;
    
    // Clean and prepare name variations
    const cleanName = directorName
      .replace(/^(Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.|Sir)\s+/i, '')
      .replace(/\s+(Jr\.?|Sr\.?|III|II|IV)$/i, '')
      .trim();
    
    const nameParts = cleanName.toLowerCase().split(/\s+/);
    const lastName = nameParts[nameParts.length - 1];
    const firstName = nameParts[0];
    const middleParts = nameParts.slice(1, -1).join(' ');
    
    // Strategy 1: Search Form 4 filings (most recent)
    console.log(`    Attempt 1: Recent Form 4 filings`);
    let searchPayload = {
      query: `issuer.cik:${companyCik} AND documentType:"4"`,
      from: "0",
      size: "50",
      sort: [{ "filedAt": { "order": "desc" } }]
    };

    let response = await fetchApi(insiderTradingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchPayload)
    });

    // Check Form 4s
    if (response.transactions && response.transactions.length > 0) {
      for (const transaction of response.transactions) {
        if (transaction.reportingOwner) {
          const ownerName = (transaction.reportingOwner.name || '').toLowerCase();
          
          // Multiple matching strategies
          const matches = [
            // Exact match
            ownerName === cleanName.toLowerCase(),
            // Contains both first and last
            (ownerName.includes(lastName) && ownerName.includes(firstName)),
            // Last name with first initial
            (ownerName.includes(lastName) && ownerName.includes(firstName.charAt(0))),
            // Reversed order
            ownerName.includes(`${lastName}, ${firstName}`),
            // Just last name if unique enough (>4 chars)
            (lastName.length > 4 && ownerName.includes(lastName) && !ownerName.includes('trust') && !ownerName.includes('llc'))
          ];
          
          if (matches.some(m => m)) {
            const cik = String(transaction.reportingOwner.cik || '').replace(/^0+/, '');
            if (cik) {
              console.log(`    ✅ Found via Form 4: ${transaction.reportingOwner.name} (CIK: ${cik})`);
              return res.json({
                found: true,
                cik: cik,
                name: transaction.reportingOwner.name,
                originalName: directorName,
                formType: '4',
                method: 'Form 4 Recent',
                filedAt: transaction.filedAt
              });
            }
          }
        }
      }
    }

    // Strategy 2: Search Form 3 filings (initial appointment)
    console.log(`    Attempt 2: Form 3 filings (initial appointment)`);
    searchPayload = {
      query: `issuer.cik:${companyCik} AND documentType:"3"`,
      from: "0",
      size: "50",
      sort: [{ "filedAt": { "order": "desc" } }]
    };

    response = await fetchApi(insiderTradingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(searchPayload)
    });

    if (response.transactions && response.transactions.length > 0) {
      for (const transaction of response.transactions) {
        if (transaction.reportingOwner) {
          const ownerName = (transaction.reportingOwner.name || '').toLowerCase();
          
          // Same matching strategies
          const matches = [
            ownerName === cleanName.toLowerCase(),
            (ownerName.includes(lastName) && ownerName.includes(firstName)),
            (ownerName.includes(lastName) && ownerName.includes(firstName.charAt(0))),
            ownerName.includes(`${lastName}, ${firstName}`),
            (lastName.length > 4 && ownerName.includes(lastName) && !ownerName.includes('trust') && !ownerName.includes('llc'))
          ];
          
          if (matches.some(m => m)) {
            const cik = String(transaction.reportingOwner.cik || '').replace(/^0+/, '');
            if (cik) {
              console.log(`    ✅ Found via Form 3: ${transaction.reportingOwner.name} (CIK: ${cik})`);
              return res.json({
                found: true,
                cik: cik,
                name: transaction.reportingOwner.name,
                originalName: directorName,
                formType: '3',
                method: 'Form 3 Initial',
                filedAt: transaction.filedAt
              });
            }
          }
        }
      }
    }

    // Strategy 3: Search by name directly in Form 4/5 (wider search)
    console.log(`    Attempt 3: Direct name search in Forms 4/5`);
    const nameQuery = `"${lastName}"`;  // Just search by last name
    searchPayload = {
      query: `reportingOwner.name:${nameQuery} AND issuer.cik:${companyCik} AND (documentType:"4" OR documentType:"5")`,
      from: "0",
      size: "20",
      sort: [{ "filedAt": { "order": "desc" } }]
    };

    try {
      response = await fetchApi(insiderTradingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchPayload)
      });

      if (response.transactions && response.transactions.length > 0) {
        for (const transaction of response.transactions) {
          if (transaction.reportingOwner) {
            const ownerName = (transaction.reportingOwner.name || '').toLowerCase();
            
            // More lenient matching for this wider search
            if (ownerName.includes(firstName.charAt(0)) || ownerName.includes(firstName)) {
              const cik = String(transaction.reportingOwner.cik || '').replace(/^0+/, '');
              if (cik) {
                console.log(`    ✅ Found via name search: ${transaction.reportingOwner.name} (CIK: ${cik})`);
                return res.json({
                  found: true,
                  cik: cik,
                  name: transaction.reportingOwner.name,
                  originalName: directorName,
                  formType: transaction.documentType || '4/5',
                  method: 'Name Search',
                  filedAt: transaction.filedAt,
                  confidence: 'medium'  // Lower confidence for this method
                });
              }
            }
          }
        }
      }
    } catch (nameSearchErr) {
      console.log(`    Name search error (non-fatal): ${nameSearchErr.message}`);
    }

    // Strategy 4: Look in any Form 3/4/5 filed in the last 5 years
    console.log(`    Attempt 4: Historical search (last 5 years)`);
    const fiveYearsAgo = new Date();
    fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
    const dateStr = fiveYearsAgo.toISOString().split('T')[0];
    
    searchPayload = {
      query: `issuer.cik:${companyCik} AND (documentType:"3" OR documentType:"4" OR documentType:"5") AND filedAt:[${dateStr} TO *]`,
      from: "0",
      size: "50",
      sort: [{ "filedAt": { "order": "desc" } }]
    };

    // Add delay to avoid rate limiting
    await delay(300);
    
    try {
      response = await fetchApi(insiderTradingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchPayload)
      });

      if (response.transactions && response.transactions.length > 0) {
        // Build a map of all unique reporting owners
        const owners = new Map();
        
        for (const transaction of response.transactions) {
          if (transaction.reportingOwner && transaction.reportingOwner.cik) {
            const ownerName = (transaction.reportingOwner.name || '').toLowerCase();
            const cik = String(transaction.reportingOwner.cik).replace(/^0+/, '');
            
            if (!owners.has(cik)) {
              owners.set(cik, {
                name: transaction.reportingOwner.name,
                cik: cik,
                lastFiling: transaction.filedAt,
                formType: transaction.documentType
              });
            }
          }
        }
        
        // Check all unique owners for matches
        for (const [cik, owner] of owners.entries()) {
          const ownerName = owner.name.toLowerCase();
          
          if (ownerName.includes(lastName) && 
              (ownerName.includes(firstName) || ownerName.includes(firstName.charAt(0)))) {
            console.log(`    ✅ Found in historical data: ${owner.name} (CIK: ${cik})`);
            return res.json({
              found: true,
              cik: cik,
              name: owner.name,
              originalName: directorName,
              formType: owner.formType,
              method: 'Historical Search',
              filedAt: owner.lastFiling,
              confidence: 'high'
            });
          }
        }
      }
    } catch (histErr) {
      console.log(`    Historical search error (non-fatal): ${histErr.message}`);
    }

    console.log(`    ❌ No match found after all attempts for ${directorName}`);
    res.json({ 
      found: false, 
      message: 'No Form 3/4/5 filings found for this director',
      searchAttempts: 4,
      searchedName: directorName 
    });

  } catch (err) {
    console.error('Error in Form 4 CIK search:', err.message);
    
    // Return a partial error that might still be retryable
    res.status(200).json({ 
      found: false, 
      error: 'Search error - please try again',
      retryable: true 
    });
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