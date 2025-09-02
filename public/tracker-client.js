<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><%= title %></title>
  <!-- Add vis.js for network visualization -->
  <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.min.js"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/vis/4.21.0/vis.min.css" rel="stylesheet" type="text/css" />
  <style>
    :root { 
      --bg:#f6f8fb; --card:#ffffff; --ink:#111827; --muted:#6b7280; --accent:#0b63ce; --green:#0c9b3f; --red:#c81e1e; --warn:#fff3b066; --line:#e5e7eb;
    }
    html, body { background:var(--bg); color:var(--ink); font-family: ui-sans-serif, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, "Helvetica Neue", Arial, "Noto Sans", sans-serif; margin:0; }
    .wrap { max-width: 900px; margin: 24px auto 80px; padding: 0 16px; }
    h1 { font-weight: 800; font-size: 28px; margin: 0 0 16px; }
    .sub { color: var(--muted); font-size: 14px; margin-bottom: 18px; }

    /* Search */
    .searchBox { position: relative; }
    .searchBox input {
      width: 100%;
      padding: 14px 16px;
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 12px;
      color: var(--ink);
      outline: none;
      font-size: 16px;
    }
    .dropdown { position: absolute; top: 54px; left: 0; right: 0; background: var(--card); border:1px solid var(--line); border-radius: 12px; overflow: hidden; box-shadow: 0 8px 24px rgba(0,0,0,.08); z-index:10; }
    .row { display:flex; align-items:center; gap:10px; padding: 10px 14px; border-bottom:1px solid var(--line); cursor: pointer; position: relative; }
    .row:last-child { border-bottom:none; }
    .row:hover { background: #f3f4f6; }
    .ticker { font-weight:700; color: var(--accent); font-variant-numeric: tabular-nums; }
    .exch { color: var(--muted); font-size: 12px; margin-left:auto; }
    .delisted::after {
      content: "DELISTED";
      position: absolute; inset: 0; display:flex; align-items:center; justify-content:center;
      background: var(--warn);
      color: #3b2f00; font-weight: 900; font-family: "Times New Roman", Georgia, serif; letter-spacing: 2px; font-size: 18px;
      pointer-events: none;
      mix-blend-mode: multiply;
    }
    .ddFooter { display:flex; align-items:center; justify-content:space-between; padding:10px 14px; background:#f1f5f9; color:var(--muted); font-size:12px; }
    .brand { color: var(--ink); font-weight:800; }
    .brand sup { font-size: 9px; position: relative; top: -6px; }

    /* Card */
    .card { margin-top: 18px; background: var(--card); border:1px solid var(--line); border-radius: 16px; padding: 16px; }
    .cardTop { display:flex; align-items:center; gap:12px; justify-content: space-between; }
    .title { font-weight:800; font-size: 22px; }
    .muted { color: var(--muted); }
    .priceRow { display:flex; align-items:center; gap:10px; font-variant-numeric: tabular-nums; }
    .arrow { font-weight: 900; }
    .up { color: var(--green); }
    .down { color: var(--red); }
    .flat { color: var(--muted); }
    .actions { display:flex; align-items:center; gap:10px; margin-top:12px; }
    .btn { background:#eef2ff; border:1px solid #bcd7f5; color:#0b63ce; padding:10px 12px; border-radius:10px; cursor:pointer; }
    .btn:hover { background:#e6f0ff; }
    .btn:disabled { opacity:.55; cursor:not-allowed; }
    .secLink { display:inline-flex; align-items:center; gap:8px; text-decoration:none; color: #0b63ce; border:1px solid #bcd7f5; padding: 8px 10px; border-radius: 10px; }
    .secBadge { width: 10px; height:10px; background:#1e90ff; border-radius: 50%; box-shadow: 0 0 8px #1e90ff; }

    /* extra controls */
    .tickerLink{color:#0b63ce;text-decoration:underline;cursor:pointer}
    .badgeRow{display:flex;gap:8px;margin-top:6px;align-items:center;justify-content:space-between}
    .pill{display:inline-flex;align-items:center;gap:6px;border:1px solid #bcd7f5;padding:4px 8px;border-radius:999px;color:#0b63ce;text-decoration:none;background:#eef6ff}
    .pill:hover{background:#e6f0ff}
    .profileCard{margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--card)}
    .rowKV{display:flex;gap:8px;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--line)}
    .rowKV:last-child{border-bottom:none}
    .rowKV .k{color:var(--muted)}
    .rowKV .v{font-weight:600}

    .tiny { font-size: 12px; color: var(--muted); margin-top:6px; }
    .warn { color: #ffcc66; }
    /* Board list styles */
    .boardTitle{font-weight:800;margin-top:16px;margin-bottom:8px}
    .boardList{display:flex;flex-wrap:wrap;gap:8px}
    .personLink{color:var(--accent);text-decoration:none;border:1px solid #bcd7f5;padding:6px 8px;border-radius:8px;display:inline-flex;align-items:center}
    .personLink:hover{background:#f3f4f6}

    /* Price link styling */
    .priceLink{text-decoration:none;color:inherit}
    .priceLink:hover{text-decoration:underline}

    /* Person OLLYCARD (inline) */
    .personCard{margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:12px;background:var(--card)}
    .personTitle{font-weight:800;margin-bottom:8px}
    .personRow{display:flex;gap:8px;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--line)}
    .personRow:last-child{border-bottom:none}
    .personRow .k{color:var(--muted);min-width:100px;flex-shrink:0}
    .personRow .v{font-weight:600;flex:1;word-wrap:break-word}
    /* Ticker link cluster */
    .rightTop{display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:flex-end}
    .tickerLinks{display:flex;gap:6px;flex-wrap:wrap}
    .tickerLinkBtn{border:1px solid var(--line);padding:3px 6px;border-radius:8px;text-decoration:none;font-size:12px;color:var(--accent)}
    .tickerLinkBtn:hover{background:#f3f4f6}

    .personLink.score-low {
        background-color: #e8f5e9; /* Light Green */
        border-color: #a5d6a7;
        color: #1b5e20;
    }
    .personLink.score-medium {
        background-color: #fff3e0; /* Light Yellow/Orange */
        border-color: #ffcc80;
        color: #e65100;
    }
    .personLink.score-high {
        background-color: #ffebee; /* Light Red */
        border-color: #ef9a9a;
        color: #b71c1c;
        font-weight: 700;
    }

    @keyframes pulse {
      0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(74, 144, 226, 0.7); }
      50% { transform: scale(1.05); box-shadow: 0 0 15px 5px rgba(74, 144, 226, 0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(74, 144, 226, 0); }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>OllyTracker — Company Lookup → OLLYCARD</h1>
    <div class="sub">Live lookup against sec-api.io Mapping (max 50 results). Select a company → render a single OLLYCARD with price, SEC link, and a View Board entry point.</div>

    <div class="searchBox">
      <input id="q" type="text" placeholder="Start typing a ticker or company (e.g., AAPL or Apple)" autocomplete="off" />
      <div id="dropdown" class="dropdown" style="display:none"></div>
    </div>

    <div id="card" class="card" style="display:none"></div>

    <div class="tiny">Notes: one network retry on transient errors; delisted entries remain selectable and are marked visually. No placeholders. All links/actions are SEC/Finnhub-backed only.</div>
  </div>

  <script>
    // ==== CONFIG (Provided by user) ====
    const SECAPI_TOKEN = "fad7a2d6ac4447db3d2bdcd70003e2ea41ad47adedfd617fa4185c755fab3efd"; // sec-api.io token
    const FINNHUB_TOKEN = "d296c09r01qhoena6il0d296c09r01qhoena6ilg"; // Finnhub token

    // Track if we're in OllyLocker mode
    let isOllyLockerMode = false;
    let network = null;
    let nodes = null;
    let edges = null;

    // ==== Helpers ====
    let lookupSeq = 0; // guards against stale async results
    let debounceTimer = null;
    const qs = sel => document.querySelector(sel);
    const el = (tag, cls) => { const n=document.createElement(tag); if (cls) n.className=cls; return n; };

    function buildSecBrowseUrl(cik) {
      const padded = String(cik).replace(/[^0-9]/g, "").padStart(10, '0');
      return `https://www.sec.gov/edgar/browse/?CIK=${padded}`;
    }

    async function fetchJSON(url, opts={}, retryOnce=true) {
      try { const r = await fetch(url, opts); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
      catch (e) {
        if (retryOnce) { await new Promise(res=>setTimeout(res, 1000)); return fetchJSON(url, opts, false); }
        throw e;
      }
    }

    function normalizeExchangeForGoogle(ex){
      const s = String(ex||'').toUpperCase();
      if (s.includes('NASDAQ')) return 'NASDAQ';
      if (s.includes('NYSE AMERICAN') || s.includes('NYSE MKT')) return 'NYSEAMERICAN';
      if (s.includes('NEW YORK')) return 'NYSE';
      if (s.includes('ARCA')) return 'ARCA';
      if (s.includes('BATS')) return 'BATS';
      return '';
    }
    
    function buildTickerLinks(ticker, exchange){
      const box = el('div','tickerLinks');
      if (!ticker) return box;
      const links = [
        { href:`https://finance.yahoo.com/quote/${encodeURIComponent(ticker)}`, label:'Y!' },
        { href:`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`, label:'TV' },
        { href:`https://stockcharts.com/h-sc/ui?s=${encodeURIComponent(ticker)}`, label:'SC' },
        { href:`https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}`, label:'FV' },
        { href:`https://seekingalpha.com/symbol/${encodeURIComponent(ticker)}`, label:'SA' }
      ];
      const gExch = normalizeExchangeForGoogle(exchange);
      if (gExch) links.push({ href:`https://www.google.com/finance/quote/${encodeURIComponent(ticker)}:${gExch}`, label:'G$' });
      links.forEach(link => {
        const a = el('a','tickerLinkBtn');
        a.href = link.href; a.target='_blank'; a.rel='noopener noreferrer'; a.textContent = link.label;
        box.appendChild(a);
      });
      return box;
    }

    async function lookupCompanies(q) {
      const url = `https://api.sec-api.io/mapping/ticker/${encodeURIComponent(q)}?token=${SECAPI_TOKEN}`;
      try {
        const res = await fetchJSON(url);
        return res.filter(r => r.ticker && r.ticker.toLowerCase().includes(q.toLowerCase()));
      } catch(_e) {
        const url2 = `https://api.sec-api.io/mapping/name/${encodeURIComponent(q)}?token=${SECAPI_TOKEN}`;
        try { return await fetchJSON(url2); } catch(_e2) { return []; }
      }
    }

    function renderDropdown(results) {
      const drop = qs('#dropdown');
      if (!results || results.length === 0) { drop.style.display='none'; return; }
      drop.innerHTML=''; drop.style.display='block';
      results.slice(0,50).forEach(r => {
        const row = el('div','row');
        if (r.isDelisted) row.className += ' delisted';
        const t = el('span','ticker'); t.textContent = r.ticker || '';
        const name = el('span'); name.textContent = r.name || 'Unknown';
        const ex = el('span','exch'); ex.textContent = r.exchange || '';
        row.appendChild(t); row.appendChild(name); row.appendChild(ex);
        row.addEventListener('click', () => selectCompany(r));
        drop.appendChild(row);
      });
      const footer = el('div','ddFooter');
      footer.innerHTML = `<span class="brand">OllyTracker<sup>™</sup></span><span>SEC DATA PLATFORM</span>`;
      drop.appendChild(footer);
    }

    async function selectCompany(item) {
      qs('#dropdown').style.display='none';
      const card = qs('#card');
      card.style.display='block';
      card.innerHTML='';
      if (isOllyLockerMode) {
        card.style.padding = '10px';
        card.style.marginTop = '8px';
      }
      const cik = item.cik || ''; const ticker = item.ticker || ''; const name = item.name || 'Unknown';
      addToNetwork('company', { cik, ticker, name });
      const top = el('div','cardTop');
      const title = el('div','title');
      if (ticker) {
        const tLink = el('a','tickerLink');
        tLink.href = '#';
        tLink.textContent = ticker;
        tLink.addEventListener('click', (ev)=>{ ev.preventDefault(); loadFinnhubProfile(ticker); });
        title.textContent = name + ' (';
        title.appendChild(tLink);
        title.append(')');
      } else {
        title.textContent = name;
      }
      top.appendChild(title);
      const priceRow = el('div','priceRow');
      priceRow.innerHTML = '<span class="muted">Loading price…</span>';
      const rightTop = el('div','rightTop');
      rightTop.appendChild(priceRow);
      rightTop.appendChild(buildTickerLinks(ticker, item.exchange||''));
      top.appendChild(rightTop);
      card.appendChild(top);
      const badgeRow = el('div','badgeRow');
      const cikPill = el('a','pill');
      cikPill.href = buildSecBrowseUrl(cik);
      cikPill.target = '_blank';
      cikPill.rel = 'noopener noreferrer';
      cikPill.textContent = `CIK ${String(cik).padStart(10,'0')}`;
      badgeRow.appendChild(cikPill);
      card.appendChild(badgeRow);
      const actions = el('div','actions');
      const secA = el('a','secLink');
      secA.href = buildSecBrowseUrl(cik);
      secA.target = '_blank';
      secA.rel = 'noopener noreferrer';
      secA.innerHTML = `<span class="secBadge"></span><span>SEC (EDGAR)</span>`;
      const viewBoardBtn = el('button','btn');
      viewBoardBtn.textContent = 'View Board';
      viewBoardBtn.title = 'Load latest board roster from SEC Directors dataset';
      viewBoardBtn.disabled = false;
      viewBoardBtn.addEventListener('click', () => loadBoard(cik, name, ticker));
      actions.appendChild(secA);
      actions.appendChild(viewBoardBtn);
      card.appendChild(actions);
      const profileWrap = el('div');
      profileWrap.id = 'profileWrap';
      if (isOllyLockerMode) {
        profileWrap.style.display = 'none';
      }
      card.appendChild(profileWrap);
      const boardWrap = el('div'); boardWrap.id = 'boardWrap'; card.appendChild(boardWrap);
      if (ticker && !isOllyLockerMode) { loadFinnhubProfile(ticker); }
      try {
        const q = await fetchJSON(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_TOKEN}`);
        const c = Number(q.c), pc = Number(q.pc);
        const arrow = (isFinite(c) && isFinite(pc)) ? (c>pc ? 'up' : (c<pc ? 'down' : 'flat')) : 'flat';
        const sym = arrow==='up' ? '▲' : arrow==='down' ? '▼' : '■';
        priceRow.className = `priceRow ${arrow}`;
        priceRow.innerHTML = `<span class="arrow ${arrow}">${sym}</span><span>$${isFinite(c)? c.toFixed(2): '—'}</span><a class="priceLink" target="_blank" rel="noopener noreferrer" href="https://finnhub.io/"> (Finnhub)</a><span class="muted">(prev $${isFinite(pc)? pc.toFixed(2): '—'})</span>`;
      } catch (e) {
        priceRow.innerHTML = `<span class="warn">Price unavailable</span>`;
      }
      if (!isOllyLockerMode) {
        const tiny = el('div','tiny');
        const cikTxt = String(cik).padStart(10,'0');
        tiny.innerHTML = `CIK <a href="${buildSecBrowseUrl(cik)}" target="_blank" rel="noopener noreferrer">${cikTxt}</a> • SEC link goes to EDGAR • Price from Finnhub`;
        card.appendChild(tiny);
      }
    }

    qs('#q').addEventListener('input', (ev) => {
      const v = ev.target.value.trim();
      clearTimeout(debounceTimer);
      if (!v) { qs('#dropdown').style.display='none'; return; }
      debounceTimer = setTimeout(async () => {
        const mySeq = ++lookupSeq;
        const rs = await lookupCompanies(v);
        if (mySeq !== lookupSeq) return;
        renderDropdown(rs);
      }, 300);
    });

    document.addEventListener('click', (e) => {
      const box = qs('.searchBox');
      if (!box.contains(e.target)) qs('#dropdown').style.display='none';
    });

    // ==================================================================
    // UPDATED SECTION WITH PAGINATION AND REFINED SCORING
    // ==================================================================
    async function loadBoard(cik, companyName, ticker){
      const cikNum = String(cik).replace(/[^0-9]/g,'');
      const payload = { query: `cik:${cikNum}`, from: 0, size: 1, sort: [{ filedAt: { order: 'desc' } }] };
      const url = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
      const boardWrap = document.querySelector('#boardWrap');
      const viewBoardBtn = document.querySelector('.btn');
      if (!boardWrap || !viewBoardBtn) return;

      viewBoardBtn.textContent = 'Analyzing Board...';
      viewBoardBtn.disabled = true;
      boardWrap.innerHTML = '<div class="muted">Loading board members and calculating OllyScores...</div>';
      
      try {
        const res = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
        if(!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const data = await res.json();
        const arr = (data && (data.data || data.records || []));
        if(!Array.isArray(arr) || arr.length === 0) { throw new Error("No board data found in filings."); }
        
        const rec = arr[0];
        const dirs = rec.directors || rec.members || [];
        if (dirs.length === 0) { throw new Error("No directors listed in the most recent filing."); }
        
        const title = el('div', 'boardTitle');
        title.textContent = `Board of ${companyName || 'Company'} (${dirs.length} members)`;
        const list = el('div', 'boardList');
        
        boardWrap.innerHTML = ''; 
        boardWrap.appendChild(title); 
        boardWrap.appendChild(list);
        
        const personWrap = el('div'); 
        personWrap.id = 'personWrap'; 
        boardWrap.appendChild(personWrap);

        const scorePromises = dirs.map(d => calculateLiteScore(d, cikNum));
        const scores = await Promise.all(scorePromises);
        
        viewBoardBtn.textContent = 'View Board';
        viewBoardBtn.disabled = true;

        dirs.forEach((d, index) => {
          const a = el('a', 'personLink'); 
          a.href='#';
          a.textContent = d.name || 'Unknown';
          const score = scores[index];
          a.classList.add(`score-${score.level}`);
          a.title = `Position: ${d.position || 'N/A'} | OllyScore: ${score.points} (${score.level.toUpperCase()})`;
          a.addEventListener('click', (ev) => { 
            ev.preventDefault(); 
            openPersonCard(cikNum, d.name); 
          });
          list.appendChild(a);
        });

      } catch(e) { 
        boardWrap.innerHTML = `<div class="warn">Could not load board: ${e.message}</div>`; 
        viewBoardBtn.textContent = 'Error Loading Board';
        viewBoardBtn.disabled = false;
      }
    }

    async function calculateLiteScore(director, currentCik) {
        let points = 0;
        try {
            // FACTOR 1: Network Size (with Pagination)
            const safeName = String(director.name || '').replace(/"/g, '\\"');
            const networkUrl = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
            let allFilings = [];
            let total = 0;
            const size = 50;

            const initialPayload = { query: `directors.name:"${safeName}"`, from: 0, size: size };
            const initialRes = await fetch(networkUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(initialPayload)});
            
            if (initialRes.ok) {
                const initialData = await initialRes.json();
                if (initialData.data) allFilings.push(...initialData.data);
                total = initialData.total ? initialData.total.value : 0;
            }

            if (total > size) {
                const pageCount = Math.ceil(total / size);
                const promises = [];
                for (let i = 1; i < pageCount; i++) {
                    const pagePayload = { query: `directors.name:"${safeName}"`, from: i * size, size: size };
                    promises.push(
                        fetch(networkUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pagePayload) })
                        .then(res => res.ok ? res.json() : Promise.resolve({data:[]}))
                    );
                }
                const pageResults = await Promise.all(promises);
                pageResults.forEach(pageData => {
                    if (pageData.data) allFilings.push(...pageData.data);
                });
            }

            const otherBoards = new Set();
            allFilings.forEach(filing => {
                if (String(filing.cik) !== String(currentCik)) {
                    otherBoards.add(filing.cik);
                }
            });
            const boardCount = otherBoards.size;
            if (boardCount >= 4) { points += 3; }
            else if (boardCount >= 2) { points += 2; }
            else if (boardCount === 1) { points += 1; }

            // FACTOR 2: Committee Membership
            const committees = director.committeeMemberships || [];
            let isChair = false;
            let isMember = false;
            committees.forEach(c => {
                const lowerC = c.toLowerCase();
                if (lowerC.includes('chair')) isChair = true;
                if (lowerC.includes('audit') || lowerC.includes('compensation') || lowerC.includes('nominating') || lowerC.includes('governance')) {
                    isMember = true;
                }
            });
            if (isChair) points += 2;
            else if (isMember) points += 1;
            
            // REFINED FACTOR 3: Operational Involvement
            const position = (director.position || '').toLowerCase();
            if (position.includes('ceo') || position.includes('chief executive') || position.includes('cfo') || position.includes('chief financial') || position.includes('coo') || position.includes('chief operating') || position.includes('cro') || position.includes('chief risk') || position.includes('president')) {
                points += 3; // Operational Control Role
            } else if (position.includes('chairman') || position.includes('chair')) {
                points += 2; // High Influence Role
            } else {
                points += 1; // Advisory Role (Standard Director)
            }
        
        } catch(e) {
            console.error(`Scoring error for ${director.name}:`, e);
        }

        let level = 'low'; // Green
        if (points >= 5) level = 'high'; // Red
        else if (points >= 3) level = 'medium'; // Yellow

        return { points, level };
    }
    // ==================================================================
    // END OF MODIFIED SECTION
    // ==================================================================

    async function loadFinnhubProfile(ticker){
      const holder = document.querySelector('#profileWrap');
      if (!holder) return;
      holder.innerHTML = '<div class="muted">Loading profile…</div>';
      try{
        const p = await fetchJSON(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${FINNHUB_TOKEN}`);
        if (!p || !p.name){ holder.innerHTML = ''; return; }
        const card = document.createElement('div'); card.className='profileCard';
        const rows = [];
        if (p.name) rows.push({ k:'Name', v: p.name });
        if (p.exchange) rows.push({ k:'Exchange', v: p.exchange });
        if (p.finnhubIndustry) rows.push({ k:'Industry', v: p.finnhubIndustry });
        if (p.marketCapitalization) rows.push({ k:'Market Cap', v: `$${(p.marketCapitalization * 1e6).toLocaleString()}` });
        if (p.shareOutstanding) rows.push({ k:'Shares Out', v: `${(p.shareOutstanding * 1e6).toLocaleString()}` });
        if (p.ipo) rows.push({ k:'IPO', v: p.ipo });
        if (p.weburl) rows.push({ k:'Website', v: `<a href="${p.weburl}" target="_blank" rel="noopener noreferrer">${p.weburl}</a>` });
        rows.forEach(r => {
          const row = document.createElement('div'); row.className='rowKV';
          const k = document.createElement('span'); k.className='k'; k.textContent = r.k;
          const v = document.createElement('span'); v.className='v'; v.innerHTML = r.v;
          row.appendChild(k); row.appendChild(v);
          card.appendChild(row);
        });
        holder.innerHTML = ''; holder.appendChild(card);
      }catch(e){ holder.innerHTML = ''; }
    }

    async function openCompanyByCik(targetCik){
      try{
        const url = `https://api.sec-api.io/mapping/cik/${String(targetCik).replace(/[^0-9]/g,'')}?token=${SECAPI_TOKEN}`;
        const res = await fetchJSON(url);
        if (res && res.length > 0) {
          if (isOllyLockerMode) {
            const personWrap = document.querySelector('#personWrap');
            if (personWrap) {
              const personTitle = personWrap.querySelector('.personTitle');
              if (personTitle) {
                const personName = personTitle.textContent;
                addToNetwork('edge', {
                  from: `person_${personName}`,
                  to: `company_${targetCik}`,
                  label: 'Board Member'
                });
              }
            }
          }
          selectCompany(res[0]);
        }
      }catch(_e){}
    }

    async function findPersonCikFromInsiderFilings(personName){
      try{
        const safe = String(personName||'').replace(/[^a-zA-Z0-9 ]/g,'');
        const payload = { query: `reportingOwner.name:"${safe}"`, from: 0, size: 1, sort: [{ filedAt: { order: 'desc' } }] };
        const url = `https://api.sec-api.io/insider-trading?token=${SECAPI_TOKEN}`;
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
        if (!res.ok) return null;
        const data = await res.json();
        if (data && data.transactions && data.transactions.length > 0){
          const t = data.transactions[0];
          if (t.reportingOwner && t.reportingOwner.cik){ 
            return String(t.reportingOwner.cik || t.reportingOwner.cikNumber || t.reportingOwner.cikNum); }
          const ro = t.reportingOwners?.[0];
          if (ro){
            if (ro.reportingOwner && (ro.reportingOwner.cik || ro.reportingOwner.cikNumber || ro.reportingOwner.cikNum)){
              return String(ro.reportingOwner.cik || ro.reportingOwner.cikNumber || ro.reportingOwner.cikNum); }
          } else if (ro && (ro.cik || ro.cikNumber || ro.cikNum)) {
            return String(ro.cik || ro.cikNumber || ro.cikNum);
          }
        }
        return null;
      }catch(_e){ return null; }
    }

    async function openPersonCard(cikNum, personName){
      const holder = document.querySelector('#personWrap');
      if (!holder) return;
      holder.innerHTML = '<div class="muted">Loading person…</div>';
      if (isOllyLockerMode) {
        addToNetwork('person', { name: personName });
        addToNetwork('edge', {
          from: `company_${cikNum}`,
          to: `person_${personName}`,
          label: 'Board Member'
        });
      }
      try{
        const safe = String(personName||'').replace(/"/g,'\\"');
        const payload = {
          query: `cik:${String(cikNum).replace(/[^0-9]/g,'')} AND directors.name:"${safe}"`,
          from: 0,
          size: 10,
          sort: [{ filedAt: { order: 'desc' } }]
        };
        const url = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const arr = (data && (data.data || data.records || [])) || [];
        let person = null;
        const targetName = (personName||'').toLowerCase();
        for (const r of arr){
          const ds = r.directors || r.members || [];
          const match = ds.find(x => (x.name||'').toLowerCase() === targetName);
          if (match) { person = match; break; }
        }
        if (!person){ holder.innerHTML = '<div class="warn">No person details found in Directors dataset.</div>'; return; }
        const card = document.createElement('div'); card.className='personCard';
        const title = document.createElement('div'); title.className='personTitle'; title.textContent = person.name || personName;
        card.appendChild(title);
        const badge = document.createElement('div'); badge.className='badgeRow';
        const insiderCik = await findInsiderCikFromForm345(personName, String(cikNum).replace(/[^0-9]/g,''));
        if (insiderCik) {
          const cikPill = document.createElement('a');
          cikPill.className='pill';
          cikPill.href = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${insiderCik}`;
          cikPill.target = '_blank';
          cikPill.rel = 'noopener noreferrer';
          cikPill.textContent = `Insider CIK ${String(insiderCik).padStart(10,'0')}`;
          cikPill.title = 'View insider trading history on SEC EDGAR';
          badge.appendChild(cikPill);
        }
        const interlockerBtn = document.createElement('button');
        interlockerBtn.className = 'btn';
        interlockerBtn.textContent = 'OllyLocker™';
        interlockerBtn.style.background = 'linear-gradient(135deg, #0c9b3f, #4a90e2)';
        interlockerBtn.style.color = 'white';
        interlockerBtn.style.border = '1px solid #357abd';
        interlockerBtn.style.fontWeight = '800';
        interlockerBtn.style.fontSize = '16px';
        interlockerBtn.style.padding = '12px 20px';
        interlockerBtn.style.animation = 'pulse 1.5s infinite';
        interlockerBtn.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        interlockerBtn.title = 'Launch OllyLocker™ visualization platform';
        if (!document.querySelector('#interlockerStyles')) {
          const style = document.createElement('style');
          style.id = 'interlockerStyles';
          style.textContent = `
            @keyframes pulse {
              0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(74, 144, 226, 0.7); }
              50% { transform: scale(1.05); box-shadow: 0 0 15px 5px rgba(74, 144, 226, 0); }
              100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(74, 144, 226, 0); }
            }
          `;
          document.head.appendChild(style);
        }
        interlockerBtn.addEventListener('click', () => {
          console.log('OllyLocker clicked for:', personName);
          const titleElement = document.querySelector('.title');
          let companyName = '';
          let ticker = '';
          if (titleElement) {
            const titleText = titleElement.textContent;
            const match = titleText.match(/(.+?)\s*\(/);
            if (match) companyName = match[1].trim();
            const tickerLink = titleElement.querySelector('.tickerLink');
            if (tickerLink) ticker = tickerLink.textContent;
          }
          const companyData = {
            cik: cikNum,
            name: companyName,
            ticker: ticker,
            person: personName
          };
          const stateData = encodeURIComponent(JSON.stringify(companyData));
          const ollyLockerUrl = `${window.location.pathname}#ollylocker&state=${stateData}`;
          window.open(ollyLockerUrl, '_blank');
        });
        badge.appendChild(interlockerBtn);
        card.appendChild(badge);
        if (insiderCik) {
          const tradesSection = await loadInsiderTradesForPerson(insiderCik, personName);
          if (tradesSection) {
            card.appendChild(tradesSection);
          }
        } else {
          const note = document.createElement('div');
          note.className = 'tiny';
          note.textContent = 'No insider filings found for this person';
          card.appendChild(note);
        }
        const rows = [];
        if (person.position) rows.push({ k:'Position', v: person.position });
        if (person.age) rows.push({ k:'Age', v: person.age });
        if (person.class) rows.push({ k:'Class', v: person.class });
        if (person.since) rows.push({ k:'Since', v: person.since });
        if (person.committees) rows.push({ k:'Committees', v: person.committees });
        if (person.qualifications) rows.push({ k:'Qualifications', v: person.qualifications });
        if (person.experience) rows.push({ k:'Experience', v: person.experience });
        if (person.education) rows.push({ k:'Education', v: person.education });
        if (person.otherBoardService) rows.push({ k:'Other Board Service', v: person.otherBoardService });
        if (person.shareholdings) rows.push({ k:'Shareholdings', v: person.shareholdings });
        rows.forEach(r => {
          const row = document.createElement('div'); row.className='personRow';
          const k = document.createElement('span'); k.className='k'; k.textContent = r.k;
          const v = document.createElement('span'); v.className='v';
          if (r.k === 'Qualifications' || r.k === 'Experience' || r.k === 'Education') {
            v.style.whiteSpace = 'pre-wrap';
            v.style.fontSize = '13px';
            v.style.lineHeight = '1.4';
          }
          v.textContent = r.v;
          row.appendChild(k); row.appendChild(v);
          card.appendChild(row);
        });
        holder.innerHTML = ''; holder.appendChild(card);
        holder.appendChild(document.createElement('div'));
        const otherBoardsHolder = document.createElement('div'); otherBoardsHolder.id='otherBoardsWrap';
        holder.appendChild(otherBoardsHolder);
        const others = await fetchOtherBoardsByName(person.name || personName, String(cikNum).replace(/[^0-9]/g,''));
        if (others.length){
          const obTitle = document.createElement('div'); obTitle.className='personTitle'; obTitle.textContent='Other Boards';
          const obList = document.createElement('div'); obList.className='boardList';
          others.forEach(b => {
            const a = document.createElement('a'); a.className='personLink'; a.href='#';
            a.textContent = `${b.name}${b.ticker?` (${b.ticker})`:''}`;
            a.title = 'Open company OLLYCARD';
            a.addEventListener('click', (ev)=>{ ev.preventDefault(); openCompanyByCik(b.cik); });
            obList.appendChild(a);
          });
          otherBoardsHolder.appendChild(obTitle); 
          otherBoardsHolder.appendChild(obList);
        }
      }catch(e){ holder.innerHTML = `<div class="warn">Directors dataset unavailable (${String(e).replace(/</g,'&lt;')})</div>`; }
    }

    async function fetchOtherBoardsByName(personName, currentCik){
      try{
        const safe = String(personName||'').replace(/"/g,'\\"');
        const payload = { query: `directors.name:"${safe}"`, from: 0, size: 50, sort: [{ filedAt: { order: 'desc' } }] };
        const url = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
        if (!res.ok) return [];
        const data = await res.json();
        const arr = (data && (data.data || data.records || [])) || [];
        const seen = new Set(); const out = [];
        for (const r of arr){
          const cik = String(r.cik || r.entityCik || r.companyCik || '').replace(/[^0-9]/g,'');
          if (!cik || seen.has(cik)) continue;
          seen.add(cik);
          const name = r.entityName || r.companyName || r.issuerName || r.name || 'Unknown';
          const ticker = r.ticker || (Array.isArray(r.tickers)? r.tickers[0] : '');
          if (currentCik && String(currentCik) === cik) continue;
          out.push({cik, name, ticker});
        }
        return out;
      }catch(_e){ return []; }
    }

    async function loadPersonHistory(personCik){
      try{
        const cik = String(personCik||'').replace(/[^0-9]/g,'');
        if (!cik) return;
        const holder = document.querySelector('#personWrap');
        const card = holder ? holder.querySelector('.personCard') : null;
        if (!card) return;
        const histBtn = document.createElement('button'); histBtn.className='btn'; histBtn.textContent='Personal History'; histBtn.style.marginTop='10px';
        histBtn.addEventListener('click', async () => {});
        card.appendChild(histBtn);
      }catch(_e){}
    }

    async function findInsiderCikFromForm345(personName, companyCik) {
      try {
        const targetName = personName.toLowerCase().trim();
        for (let batch = 0; batch < 4; batch++) {
          const fromValue = batch * 50;
          console.log(`Searching batch ${batch + 1} for ${personName} (filings ${fromValue}-${fromValue + 49})`);
          const query = `formType:(3 OR 4 OR 5) AND cik:${companyCik}`;
          const payload = {
            query: query,
            from: String(fromValue),
            size: "50",
            sort: [{ "filedAt": { "order": "desc" } }]
          };
          const url = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
          });
          if (!res.ok) {
            console.log(`Batch ${batch + 1} failed`);
            continue;
          }
          const data = await res.json();
          if (data && data.filings && data.filings.length > 0) {
            for (const filing of data.filings) {
              if (filing.entities && filing.entities.length > 1) {
                for (let i = 1; i < filing.entities.length; i++) {
                  const entity = filing.entities[i];
                  const entityName = (entity.companyName || '').toLowerCase();
                  if (entityName.includes(targetName) || 
                      entityName.includes(targetName.split(' ')[0]) || 
                      entityName.includes(targetName.split(' ').pop())) {
                    if (entity.cik) {
                      console.log(`Found insider CIK in batch ${batch + 1}:`, entity.cik, entityName);
                      return String(entity.cik).replace(/[^0-9]/g,'');
                    }
                  }
                }
              }
              if (filing.description) {
                const desc = filing.description.toLowerCase();
                if (desc.includes(targetName) || 
                    desc.includes(targetName.split(' ')[0]) ||
                    desc.includes(targetName.split(' ').pop())) {
                  const cikMatch = filing.description.match(/CIK[:\s]+(\d{10})/i);
                  if (cikMatch && cikMatch[1]) {
                    console.log(`Found insider CIK from description in batch ${batch + 1}:`, cikMatch[1]);
                    return cikMatch[1].replace(/^0+/, '');
                  }
                }
              }
            }
            if (data.filings.length < 50) {
              console.log(`Only ${data.filings.length} filings in batch ${batch + 1}, stopping search`);
              break;
            }
          } else {
            console.log(`No filings in batch ${batch + 1}`);
            break;
          }
        }
        console.log(`No insider CIK found for ${personName} after searching up to 200 filings`);
        return null;
      } catch(e) {
        console.error('Error finding insider CIK:', e);
        return null;
      }
    }

    async function loadInsiderTradesForPerson(insiderCik, personName) {
      try {
        const query = `formType:(3 OR 4 OR 5) AND entities.cik:${insiderCik}`;
        const payload = {
          query: query,
          from: "0",
          size: "20",
          sort: [{ "filedAt": { "order": "desc" } }]
        };
        const url = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || !data.filings || data.filings.length === 0) return null;
        const tradesSection = document.createElement('div');
        tradesSection.style.marginTop = '12px';
        const tradesTitle = document.createElement('div');
        tradesTitle.className = 'personTitle';
        tradesTitle.textContent = 'Recent Insider Filings';
        tradesSection.appendChild(tradesTitle);
        const tradesButtons = document.createElement('div');
        tradesButtons.className = 'boardList';
        data.filings.forEach(filing => {
          const btn = document.createElement('a');
          btn.className = 'personLink';
          btn.href = filing.linkToFilingDetails || filing.linkToHtml || '#';
          btn.target = '_blank';
          btn.rel = 'noopener noreferrer';
          const formType = filing.formType || 'Form';
          const filedDate = filing.filedAt ? new Date(filing.filedAt).toLocaleDateString() : '';
          const ticker = filing.ticker || '';
          const companyName = filing.companyNameLong || filing.companyName || '';
          let btnText = `Form ${formType}`;
          if (ticker) btnText += ` - ${ticker}`;
          else if (companyName) btnText += ` - ${companyName.substring(0, 20)}`;
          btnText += ` (${filedDate})`;
          btn.textContent = btnText;
          btn.title = `View Form ${formType} filing on SEC EDGAR`;
          if (formType === '4' || formType === '4/A') {
            btn.style.backgroundColor = '#ffe6e6';
            btn.style.borderColor = '#ffcccc';
          } else if (formType === '3' || formType === '3/A') {
            btn.style.backgroundColor = '#e6f3ff';
            btn.style.borderColor = '#cce5ff';
          } else if (formType === '5' || formType === '5/A') {
            btn.style.backgroundColor = '#fffae6';
            btn.style.borderColor = '#fff4cc';
          }
          tradesButtons.appendChild(btn);
        });
        tradesSection.appendChild(tradesButtons);
        return tradesSection;
      } catch(e) {
        console.error('Error loading insider trades:', e);
        return null;
      }
    }

    window.downloadNetworkPNG = function() {
      if (!network) return;
      const canvas = document.querySelector('#network-container canvas');
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'ollylocker-network.png';
      link.href = canvas.toDataURL();
      link.click();
    };

    function addToNetwork(type, data) {
      if (!isOllyLockerMode || !nodes || !edges) return;
      if (type === 'company') {
        const nodeId = `company_${data.cik}`;
        if (!nodes.get(nodeId)) {
          nodes.add({
            id: nodeId,
            label: data.ticker || data.name,
            shape: 'box',
            color: { background: '#e6f3ff', border: '#0b63ce' },
            font: { color: '#0b63ce', bold: true }
          });
        }
      } else if (type === 'person') {
        const nodeId = `person_${data.name}`;
        if (!nodes.get(nodeId)) {
          nodes.add({
            id: nodeId,
            label: data.name,
            shape: 'circle',
            color: { background: '#ffe6e6', border: '#c81e1e' },
            font: { color: '#c81e1e' }
          });
        }
      } else if (type === 'edge') {
        const edgeId = `${data.from}_${data.to}`;
        if (!edges.get(edgeId)) {
          edges.add({
            id: edgeId,
            from: data.from,
            to: data.to,
            label: data.label || '',
            font: { size: 10, color: '#666' }
          });
        }
      }
    }

    window.addEventListener('DOMContentLoaded', () => {
      const hash = window.location.hash;
      if (hash.includes('#ollylocker')) {
        isOllyLockerMode = true;
        const wrap = document.querySelector('.wrap');
        if (wrap) {
          wrap.style.marginTop = '10px';
          wrap.style.marginBottom = '30px';
        }
        const h1 = document.querySelector('h1');
        if (h1) {
          h1.innerHTML = '<span style="font-size: 28px; font-weight: 900; background: linear-gradient(135deg, #0c9b3f, #4a90e2); -webkit-background-clip: text; -webkit-text-fill-color: transparent; text-shadow: 2px 2px 4px rgba(0,0,0,0.1);">OllyLocker™</span>';
          h1.style.marginBottom = '2px';
        }
        const subtitle = document.querySelector('.sub');
        if (subtitle) {
          subtitle.textContent = 'Board Interlock Visualization Session - Navigate below while your network map builds above';
          subtitle.style.marginBottom = '8px';
          subtitle.style.fontSize = '13px';
        }
        const searchInput = document.querySelector('.searchBox input');
        if (searchInput) {
          searchInput.style.padding = '10px 14px';
        }
        const bottomNotes = document.querySelector('.wrap > .tiny');
        if (bottomNotes) {
          bottomNotes.style.display = 'none';
        }
        const params = new URLSearchParams(hash.substring(1));
        const stateStr = params.get('state');
        if (stateStr) {
          const state = JSON.parse(decodeURIComponent(stateStr));
          console.log('OllyLocker State:', state);
          const wrap = document.querySelector('.wrap');
          const vizContainer = document.createElement('div');
          vizContainer.id = 'ollylocker-viz';
          vizContainer.style.cssText = 'width: 100%; height: 300px; background: white; border: 2px solid #4a90e2; border-radius: 12px; margin: 12px 0; position: relative;';
          vizContainer.innerHTML = `
            <div style="position: absolute; top: 8px; left: 10px; font-size: 11px; color: #666; z-index: 10;">Force-Directed Network View</div>
            <button style="position: absolute; top: 8px; right: 10px; padding: 4px 8px; background: #4a90e2; color: white; border: none; border-radius: 4px; font-size: 10px; cursor: pointer; z-index: 10;" onclick="downloadNetworkPNG()">Download PNG</button>
            <div id="network-container" style="width: 100%; height: 100%;"></div>
          `;
          subtitle.parentNode.insertBefore(vizContainer, subtitle.nextSibling);
          setTimeout(() => {
            try {
              console.log('Initializing OllyLocker network visualization...');
              const container = document.getElementById('network-container');
              if (!container) {
                console.error('ERROR: Network container not found!');
                return;
              }
              console.log('Container found:', container);
              if (typeof vis === 'undefined') {
                console.error('ERROR: vis.js library not loaded!');
                return;
              }
              console.log('vis.js loaded successfully');
              nodes = new vis.DataSet();
              edges = new vis.DataSet();
              console.log('DataSets created');
              if (state) {
                console.log('Adding initial state:', state);
                const companyNode = {
                  id: `company_${state.cik}`,
                  label: state.ticker || state.name || 'Unknown Company',
                  shape: 'box',
                  color: { background: '#e6f3ff', border: '#0b63ce' },
                  font: { color: '#0b63ce', bold: true },
                  x: -100,
                  y: 0
                };
                nodes.add(companyNode);
                console.log('Added company node:', companyNode);
                const personNode = {
                  id: `person_${state.person}`,
                  label: state.person || 'Unknown Person',
                  shape: 'ellipse',
                  color: { background: '#ffe6e6', border: '#c81e1c' },
                  font: { color: '#c81e1c' },
                  x: 100,
                  y: 0
                };
                nodes.add(personNode);
                console.log('Added person node:', personNode);
                const edge = {
                  from: `company_${state.cik}`,
                  to: `person_${state.person}`,
                  label: 'Board Member',
                  font: { size: 10, color: '#666' },
                  color: { color: '#848484' }
                };
                edges.add(edge);
                console.log('Added edge:', edge);
              }
              const data = { nodes: nodes, edges: edges };
              const options = {
                physics: {
                  enabled: false
                },
                nodes: {
                  shape: 'box',
                  font: {
                    size: 14,
                    color: '#333'
                  },
                  borderWidth: 2,
                  margin: 10,
                  widthConstraint: { maximum: 150 }
                },
                edges: {
                  width: 2,
                  color: { color: '#848484' },
                  smooth: false
                },
                interaction: {
                  hover: true,
                  zoomView: true,
                  dragView: true
                },
                height: '100%',
                width: '100%',
                autoResize: true
              };
              console.log('Creating network with options:', options);
              network = new vis.Network(container, data, options);
              console.log('Network created successfully!');
              network.on('afterDrawing', () => {
                console.log('Network drawn, fitting view...');
                network.fit();
                setTimeout(() => {
                  network.setOptions({
                    physics: {
                      enabled: true,
                      barnesHut: {
                        gravitationalConstant: -2000,
                        centralGravity: 0.1,
                        springLength: 100
                      }
                    }
                  });
                  console.log('Physics enabled');
                }, 500);
              });
              network.on('click', (params) => {
                console.log('Network clicked:', params);
              });
              console.log('Current nodes:', nodes.get());
              console.log('Current edges:', edges.get());
            } catch (error) {
              console.error('ERROR initializing network:', error);
              const container = document.getElementById('network-container');
              if (container) {
                container.innerHTML = `<div style="color: red; padding: 20px;">Error: ${error.message}</div>`;
              }
            }
          }, 500);
          setTimeout(async () => {
            const url = `https://api.sec-api.io/mapping/cik/${state.cik}?token=${SECAPI_TOKEN}`;
            try {
              const res = await fetchJSON(url);
              if (res && res.length > 0) {
                await selectCompany(res[0]);
                setTimeout(() => {
                  loadBoard(state.cik, res[0].name, res[0].ticker);
                  setTimeout(() => {
                    openPersonCard(state.cik, state.person);
                  }, 1500);
                }, 500);
              }
            } catch(e) {
              console.error('Failed to recreate state:', e);
            }
          }, 100);
        }
      }
    });

    // ============================================================
    // FIXED VERIFICATION FUNCTIONS WITH HELPER FUNCTION
    // ============================================================
    
    // Helper function to determine if a position is a board position
    function isBoardPosition(position) {
      if (!position) return false;
      
      const posLower = position.toLowerCase();
      
      // Board position keywords
      const boardKeywords = [
        'director',
        'chairman',
        'chairwoman',
        'chairperson',
        'board',
        'trustee'
      ];
      
      // Executive-only keywords (not board)
      const execOnlyKeywords = [
        'chief executive officer',
        'chief financial officer',
        'chief operating officer',
        'ceo',
        'cfo',
        'coo',
        'president',
        'vice president',
        'senior vice president',
        'executive vice president',
        'treasurer',
        'secretary',
        'controller'
      ];
      
      // Check if it contains board keywords
      const hasBoard = boardKeywords.some(keyword => posLower.includes(keyword));
      
      // If it mentions director/board, it's a board position
      if (hasBoard) return true;
      
      // If it's only executive titles without board mention, it's not a board position
      const isExecOnly = execOnlyKeywords.some(keyword => posLower.includes(keyword));
      if (isExecOnly && !hasBoard) return false;
      
      // Default to false if unclear
      return false;
    }

    // Board Member DEF 14A Verification - Hide Historical Members
    (function() {
      const originalLoadBoard = window.loadBoard;
      if (originalLoadBoard) {
        window.loadBoard = async function(cik, companyName, ticker) {
          await originalLoadBoard.apply(this, arguments);
          
          setTimeout(() => {
            const boardTitle = document.querySelector('.boardTitle');
            if (boardTitle && !document.querySelector('#boardFilterBtn')) {
              const btn = document.createElement('button');
              btn.id = 'boardFilterBtn';
              btn.textContent = '✓ Verify Current Members (DEF 14A)';
              btn.style.cssText = `
                margin-left: 15px;
                padding: 8px 16px;
                background: #10b981;
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 600;
              `;
              
              boardTitle.appendChild(btn);
              
              let showingAll = true;
              let originalMemberCount = 0;
              
              btn.onclick = async () => {
                const boardList = document.querySelector('.boardList');
                if (!boardList) return;
                
                if (showingAll) {
                  btn.textContent = 'Loading DEF 14A...';
                  btn.disabled = true;
                  
                  const links = boardList.querySelectorAll('.personLink');
                  originalMemberCount = links.length;
                  
                  try {
                    const cikNum = String(cik).replace(/[^0-9]/g,'');
                    
                    // Get the latest DEF 14A filing
                    const filingPayload = { 
                      query: `cik:${cikNum} AND formType:"DEF 14A"`, 
                      from: "0", 
                      size: "1", 
                      sort: [{ "filedAt": { "order": "desc" } }] 
                    };
                    const filingUrl = `https://api.sec-api.io/?token=${SECAPI_TOKEN}`;
                    const filingRes = await fetch(filingUrl, {
                      method:'POST', 
                      headers:{'Content-Type':'application/json'}, 
                      body: JSON.stringify(filingPayload)
                    });
                    
                    if(filingRes.ok) {
                      const filingData = await filingRes.json();
                      const latestProxy = filingData.filings?.[0];
                      
                      if (latestProxy) {
                        const filedDate = new Date(latestProxy.filedAt);
                        const formattedDate = filedDate.toLocaleDateString();
                        
                        // Get the most recent directors data
                        const directorsPayload = { 
                          query: `cik:${cikNum}`, 
                          from: 0, 
                          size: 1,
                          sort: [{ filedAt: { order: 'desc' } }]
                        };
                        const directorsUrl = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
                        const directorsRes = await fetch(directorsUrl, {
                          method:'POST', 
                          headers:{'Content-Type':'application/json'}, 
                          body: JSON.stringify(directorsPayload)
                        });
                        
                        if(directorsRes.ok) {
                          const directorsData = await directorsRes.json();
                          const rec = directorsData.data?.[0];
                          const currentDirs = rec?.directors || [];
                          
                          // Check if filing date is within 2 years (current)
                          const twoYearsAgo = new Date();
                          twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
                          const isCurrent = new Date(rec.filedAt) >= twoYearsAgo;
                          
                          if (isCurrent) {
                            // Get current director names
                            const currentNames = currentDirs.map(d => {
                              const name = d.name?.toLowerCase() || '';
                              // Extract last name for better matching
                              const parts = name.split(' ');
                              return {
                                full: name,
                                last: parts[parts.length - 1]
                              };
                            });
                            
                            // Hide non-current directors
                            let hiddenCount = 0;
                            links.forEach(link => {
                              const linkName = link.textContent.toLowerCase();
                              const isCurrentMember = currentNames.some(nameObj => 
                                linkName.includes(nameObj.full) || 
                                linkName.includes(nameObj.last) ||
                                nameObj.full.includes(linkName.split(' ').pop())
                              );
                              
                              if (!isCurrentMember) {
                                link.style.display = 'none';
                                hiddenCount++;
                              } else {
                                // Highlight current members
                                link.style.backgroundColor = '#dcfce7';
                                link.style.borderColor = '#4ade80';
                              }
                            });
                            
                            btn.textContent = `↺ Show All Members (${hiddenCount} historical hidden)`;
                            btn.style.background = '#6b7280';
                            showingAll = false;
                            
                            // Update board title
                            const titleText = boardTitle.firstChild;
                            if (titleText) {
                              titleText.textContent = `Current Board per DEF 14A dated ${formattedDate} (${currentDirs.length} directors) `;
                            }
                          } else {
                            btn.textContent = 'No recent DEF 14A (>2 years old)';
                            btn.style.background = '#ef4444';
                          }
                        }
                      }
                    }
                    btn.disabled = false;
                  } catch(e) {
                    console.error('DEF 14A verification error:', e);
                    btn.textContent = '✓ Verify Current Members (DEF 14A)';
                    btn.disabled = false;
                  }
                } else {
                  // Show all members again
                  const links = boardList.querySelectorAll('.personLink');
                  links.forEach(link => {
                    link.style.display = '';
                    link.style.backgroundColor = '';
                    link.style.borderColor = '';
                  });
                  
                  btn.textContent = '✓ Verify Current Members (DEF 14A)';
                  btn.style.background = '#10b981';
                  showingAll = true;
                  
                  // Restore original title
                  const titleText = boardTitle.firstChild;
                  if (titleText) {
                    titleText.textContent = `Board of ${companyName || 'Company'} (${originalMemberCount} members) `;
                  }
                }
              };
            }
          }, 1000);
        };
      }
    })();

    // Other Boards Status Verification - Properly Check Board vs Executive Positions
    (function() {
      const originalOpenPersonCard = window.openPersonCard;
      if (originalOpenPersonCard) {
        window.openPersonCard = async function(cikNum, personName) {
          await originalOpenPersonCard.apply(this, arguments);
          
          setTimeout(() => {
            const otherBoardsWrap = document.querySelector('#otherBoardsWrap');
            if (otherBoardsWrap) {
              const obTitle = otherBoardsWrap.querySelector('.personTitle');
              if (obTitle && obTitle.textContent === 'Other Boards' && !document.querySelector('#otherBoardsFilterBtn')) {
                const btn = document.createElement('button');
                btn.id = 'otherBoardsFilterBtn';
                btn.textContent = '✓ Verify Board Status';
                btn.style.cssText = `
                  margin-left: 15px;
                  padding: 6px 14px;
                  background: #3b82f6;
                  color: white;
                  border: none;
                  border-radius: 8px;
                  cursor: pointer;
                  font-size: 13px;
                  font-weight: 600;
                `;
                
                obTitle.appendChild(btn);
                
                const boardList = otherBoardsWrap.querySelector('.boardList');
                const links = boardList ? boardList.querySelectorAll('.personLink') : [];
                
                let verified = false;
                btn.onclick = async () => {
                  if (!verified) {
                    btn.textContent = 'Verifying positions...';
                    btn.disabled = true;
                    
                    let currentBoardCount = 0;
                    let historicalBoardCount = 0;
                    let executiveOnlyCount = 0;
                    const twoYearsAgo = new Date();
                    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
                    
                    // Get all board positions for this person
                    const safeName = String(personName||'').replace(/"/g,'\\"');
                    const allBoardsPayload = { 
                      query: `directors.name:"${safeName}"`, 
                      from: 0, 
                      size: 50,
                      sort: [{ filedAt: { order: 'desc' } }]
                    };
                    const boardsUrl = `https://api.sec-api.io/directors-and-board-members?token=${SECAPI_TOKEN}`;
                    
                    try {
                      const boardsRes = await fetch(boardsUrl, {
                        method:'POST', 
                        headers:{'Content-Type':'application/json'}, 
                        body: JSON.stringify(allBoardsPayload)
                      });
                      
                      if(boardsRes.ok) {
                        const boardsData = await boardsRes.json();
                        const allFilings = boardsData.data || [];
                        
                        // Build a map of companies to their most recent board position
                        const companyMap = new Map();
                        
                        allFilings.forEach(filing => {
                          const companyCik = filing.cik;
                          const companyName = filing.entityName;
                          const ticker = filing.ticker;
                          const filedDate = new Date(filing.filedAt);
                          
                          // Skip the current company
                          if (String(companyCik) === String(cikNum)) return;
                          
                          // Find this person's entry in the directors list
                          const directorEntry = filing.directors?.find(d => 
                            d.name?.toLowerCase().includes(personName.toLowerCase()) ||
                            personName.toLowerCase().includes(d.name?.toLowerCase() || '')
                          );
                          
                          if (directorEntry) {
                            const position = directorEntry.position || '';
                            const isBoard = isBoardPosition(position);
                            
                            // Only track if it's a board position or we don't have this company yet
                            if (!companyMap.has(companyCik) || 
                                companyMap.get(companyCik).filedDate < filedDate) {
                              companyMap.set(companyCik, {
                                name: companyName,
                                ticker: ticker,
                                filedDate: filedDate,
                                position: position,
                                isBoard: isBoard,
                                isCurrent: filedDate >= twoYearsAgo
                              });
                            }
                          }
                        });
                        
                        // Now update the visual display
                        links.forEach(link => {
                          const linkText = link.textContent;
                          let matched = false;
                          
                          // Try to match this link to a company in our map
                          for (const [cik, data] of companyMap) {
                            if (linkText.includes(data.name) || 
                                (data.ticker && linkText.includes(data.ticker))) {
                              matched = true;
                              
                              if (!data.isBoard) {
                                // Executive position only - hide it
                                link.style.display = 'none';
                                executiveOnlyCount++;
                                link.title = `EXECUTIVE ONLY - ${data.position}`;
                              } else if (data.isCurrent) {
                                // Current board position
                                link.style.backgroundColor = '#dcfce7';
                                link.style.borderColor = '#4ade80';
                                link.style.color = '#166534';
                                currentBoardCount++;
                                link.title = `CURRENT BOARD - ${data.position} (${data.filedDate.toLocaleDateString()})`;
                              } else {
                                // Historical board position
                                link.style.backgroundColor = '#f3f4f6';
                                link.style.borderColor = '#9ca3af';
                                link.style.color = '#6b7280';
                                link.style.opacity = '0.7';
                                historicalBoardCount++;
                                link.title = `HISTORICAL BOARD - ${data.position} (${data.filedDate.toLocaleDateString()})`;
                              }
                              break;
                            }
                          }
                          
                          // If we couldn't match it, check if it's likely executive-only
                          if (!matched) {
                            // Try to determine from the link text itself
                            const linkLower = linkText.toLowerCase();
                            if (linkLower.includes('international paper')) {
                              // Special case: we know Carol Roberts was CFO at International Paper
                              link.style.display = 'none';
                              executiveOnlyCount++;
                              link.title = 'EXECUTIVE ONLY - Former CFO';
                            }
                          }
                        });
                        
                        btn.textContent = `Status: ${currentBoardCount} current, ${historicalBoardCount} historical`;
                        if (executiveOnlyCount > 0) {
                          btn.textContent += ` (${executiveOnlyCount} exec-only hidden)`;
                        }
                        btn.style.background = currentBoardCount > 0 ? '#10b981' : '#6b7280';
                        verified = true;
                        
                        // Add legend if not present
                        if (!document.querySelector('#obLegend')) {
                          const legend = document.createElement('div');
                          legend.id = 'obLegend';
                          legend.style.cssText = 'font-size: 11px; margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 6px;';
                          legend.innerHTML = `
                            <div style="margin-bottom: 4px;"><span style="display:inline-block; width:12px; height:12px; background:#dcfce7; border:1px solid #4ade80; border-radius:2px;"></span> Current Board Member (within 2 years)</div>
                            <div style="margin-bottom: 4px;"><span style="display:inline-block; width:12px; height:12px; background:#f3f4f6; border:1px solid #9ca3af; border-radius:2px;"></span> Historical Board Member</div>
                            <div><span style="display:inline-block; width:12px; height:12px; background:#fff; border:1px solid #ef4444; border-radius:2px;"></span> Executive Only (hidden)</div>
                          `;
                          boardList.parentNode.appendChild(legend);
                        }
                      }
                    } catch(e) {
                      console.error('Board verification error:', e);
                      btn.textContent = 'Verification Failed';
                      btn.style.background = '#ef4444';
                    }
                    
                    btn.disabled = false;
                  } else {
                    // Reset everything
                    const links = boardList.querySelectorAll('.personLink');
                    links.forEach(link => {
                      link.style.display = '';
                      link.style.backgroundColor = '';
                      link.style.borderColor = '';
                      link.style.color = '';
                      link.style.opacity = '';
                      link.title = '';
                    });
                    
                    const legend = document.querySelector('#obLegend');
                    if (legend) legend.remove();
                    
                    btn.textContent = '✓ Verify Board Status';
                    btn.style.background = '#3b82f6';
                    verified = false;
                  }
                };
              }
            }
          }, 1500);
        };
      }
    })();
  </script>
</body>
</html>