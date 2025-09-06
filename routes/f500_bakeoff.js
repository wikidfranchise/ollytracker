#!/usr/bin/env node
/**
 * Fortune 500 Bakeoff Harness for OllyLookup
 * ------------------------------------------
 * WHAT IT DOES
 *  - Reads a raw text blob of the Fortune 500 snippet you pasted
 *  - Extracts company names (robust regex – handles tabs/spacing/$ formats)
 *  - Calls your local lookup endpoint:   GET {BASE_URL}/api/lookup-search?q=<name>
 *  - Ranks top hit (first item from API), computes a basic similarity score
 *  - Emits CSV: InputName,TopHitName,Ticker,Exchange,CIK,MatchScore,Notes,RawCount
 *
 * HOW TO RUN
 *  1) Make sure your lookup server is running (the Express app):
 *        node app.js
 *  2) Save your pasted list into a file, e.g. fortune500_raw.txt
 *  3) Run:
 *        node f500_bakeoff.js --in fortune500_raw.txt --out f500_lookup.csv \
 *            --base http://localhost:3000 --includeDelisted=false
 *
 * Optional:
 *  --concurrency 10   (default 8)
 *  --timeout 10000    (per request ms, default 10000)
 *
 * NOTES
 *  - This hits ONLY your /api/lookup-search endpoint. No SEC API creds needed here.
 *  - The harness flags weak/missing results so you can quickly spot issues.
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const argv = require('node:process').argv.slice(2);

// --------- tiny arg parser ----------
function getArg(name, def = undefined) {
  const k1 = `--${name}=`;
  const i = argv.findIndex(a => a === `--${name}` || a.startsWith(k1));
  if (i === -1) return def;
  const val = argv[i].includes('=') ? argv[i].split('=').slice(1).join('=') : argv[i + 1];
  return val === undefined ? true : val;
}

const IN_FILE = getArg('in', 'fortune500_raw.txt');
const OUT_FILE = getArg('out', 'f500_lookup.csv');
const BASE_URL = getArg('base', 'http://localhost:3000');
const CONCURRENCY = parseInt(getArg('concurrency', '8'), 10);
const TIMEOUT = parseInt(getArg('timeout', '10000'), 10);
const INCLUDE_DELISTED = String(getArg('includeDelisted', 'false')) === 'true';

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// -------------- parsing: pull names from raw blob ----------------
function extractNames(raw) {
  const names = new Set();

  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Pattern A: lines like "1 Walmart $680,985 ...", "225  Delta Air Lines  $61,643 ..."
  const patA = /^\d+\s+([A-Za-z0-9&().,'\-\/\sÀ-ÿ]+?)\s+\$?\d/;

  // Pattern B: sometimes there’s a dot in revenue (e.g., "548,414.4")
  const patB = /^\d+\s+([A-Za-z0-9&().,'\-\/\sÀ-ÿ]+?)\s+\$?\d[\d,]*(?:\.\d+)?/;

  for (const l of lines) {
    // Skip “View More details …”
    if (/^View More details about/i.test(l)) continue;

    let m = l.match(patA);
    if (!m) m = l.match(patB);
    if (m && m[1]) {
      const name = m[1].replace(/\s{2,}/g, ' ').trim();
      if (name && !/Remove$/i.test(name)) names.add(name);
      continue;
    }

    // Fallback: lines that look like "123  Company Name" alone
    const alt = l.match(/^\d+\s+([A-Za-z0-9&().,'\-\/\sÀ-ÿ]+)$/);
    if (alt && alt[1]) names.add(alt[1].trim());
  }

  return Array.from(names);
}

// -------------- http helper with timeout ----------------
function fetchWithTimeout(url, opts = {}, timeout = 10000) {
  return Promise.race([
    fetch(url, opts),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout)),
  ]);
}

// -------------- simple similarity for “Notes” --------------
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9&]/g, ' ').replace(/\s+/g, ' ').trim();
}
function jaccard(a, b) {
  const A = new Set(norm(a).split(' ').filter(Boolean));
  const B = new Set(norm(b).split(' ').filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

// -------------- work queue ----------------
async function run() {
  if (!fs.existsSync(IN_FILE)) die(`Input file not found: ${IN_FILE}`);

  const raw = fs.readFileSync(IN_FILE, 'utf8');
  const names = extractNames(raw);

  if (!names.length) die('No company names parsed. Check your input file.');

  console.log(`Parsed ${names.length} company names from ${IN_FILE}.`);

  const base = new URL(BASE_URL);
  const endpoint = new URL('/api/lookup-search', base);

  const results = new Array(names.length).fill(null);
  let idx = 0;
  let active = 0;

  function next() {
    if (idx >= names.length) return null;
    const i = idx++;
    return { i, name: names[i] };
  }

  async function worker(id) {
    for (;;) {
      const job = next();
      if (!job) break;
      active++;
      const q = new URL(endpoint);
      q.searchParams.set('q', job.name);
      q.searchParams.set('includeDelisted', String(INCLUDE_DELISTED));

      let row;
      try {
        const res = await fetchWithTimeout(q.toString(), { method: 'GET' }, TIMEOUT);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arr = await res.json();

        const top = Array.isArray(arr) && arr.length ? arr[0] : null;
        if (top) {
          const score = jaccard(job.name, top.company_name);
          let note = '';
          if (score >= 0.75) note = 'OK';
          else if (score >= 0.55) note = 'WEAK_MATCH';
          else note = 'MISMATCH';

          row = {
            InputName: job.name,
            TopHitName: top.company_name || '',
            Ticker: top.ticker || '',
            Exchange: top.exchange || '',
            CIK: top.cik || '',
            MatchScore: score.toFixed(3),
            Notes: note,
            RawCount: Array.isArray(arr) ? arr.length : 0,
          };
        } else {
          row = {
            InputName: job.name,
            TopHitName: '',
            Ticker: '',
            Exchange: '',
            CIK: '',
            MatchScore: '0.000',
            Notes: 'NO_HIT',
            RawCount: 0,
          };
        }
      } catch (e) {
        row = {
          InputName: job.name,
          TopHitName: '',
          Ticker: '',
          Exchange: '',
          CIK: '',
          MatchScore: '0.000',
          Notes: `ERROR:${e.message}`,
          RawCount: 0,
        };
      }
      results[job.i] = row;
      process.stdout.write(`\rProcessed ${results.filter(Boolean).length}/${names.length}`);
      active--;
    }
  }

  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) workers.push(worker(w));
  await Promise.all(workers);

  console.log('\nWriting CSV:', OUT_FILE);
  const header = [
    'InputName','TopHitName','Ticker','Exchange','CIK','MatchScore','Notes','RawCount'
  ];
  const csv = [header.join(',')]
    .concat(
      results.map(r => header.map(h => {
        const v = r[h] ?? '';
        const s = String(v);
        // basic CSV escape
        if (s.includes('"') || s.includes(',') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      }).join(','))
    )
    .join('\n');
  fs.writeFileSync(OUT_FILE, csv, 'utf8');

  // Quick summary
  const ok = results.filter(r => r.Notes === 'OK').length;
  const weak = results.filter(r => r.Notes === 'WEAK_MATCH').length;
  const miss = results.filter(r => r.Notes === 'MISMATCH' || r.Notes === 'NO_HIT').length;
  const err = results.filter(r => String(r.Notes || '').startsWith('ERROR:')).length;

  console.log(`Done. OK=${ok}, WEAK=${weak}, MISS=${miss}, ERR=${err}`);
  console.log(`Open ${OUT_FILE} to review. Search for NO_HIT / MISMATCH to tighten matches.`);
}

run().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
