#!/usr/bin/env node
/**
 * Fortune 500 batch lookup against OllyLookup
 * Usage:
 *   node run_f500.js <input_txt> <output_csv> <base_url> [--concurrency 6] [--param q]
 */

const fs = require("fs");
const path = require("path");
const axiosBase = require("axios");
const Papa = require("papaparse");
const cliProgress = require("cli-progress");
const cheerio = require("cheerio");

const axios = axiosBase.create({ timeout: 25000 });

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs() {
  const [,, inFile, outCsv, baseUrl, ...rest] = process.argv;
  if (!inFile || !outCsv || !baseUrl) {
    die("Usage: node run_f500.js <input_txt> <output_csv> <base_url> [--concurrency 6] [--param q]");
  }
  let concurrency = 6;
  let param = "q";
  for (let i=0; i<rest.length; i++) {
    if (rest[i] === "--concurrency") concurrency = Number(rest[++i] || "6");
    else if (rest[i] === "--param") param = String(rest[++i] || "q");
  }
  return { inFile, outCsv, baseUrl, concurrency, param };
}

function readNames(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const start = lines[0].toLowerCase() === "name" ? 1 : 0;
  return lines.slice(start);
}

function buildUrls(baseUrl, param, name) {
  const clean = baseUrl.replace(/\/+$/, "");
  const q = encodeURIComponent(name);
  // try your exact page first, then likely JSON-ish fallbacks
  return [
    `${clean}?${param}=${q}`,
    `${clean}/?${param}=${q}`,
    `${clean}/search?${param}=${q}`,
    `${clean}/api?${param}=${q}`,
    `${clean}/api/search?${param}=${q}`,
    `${clean}/json?${param}=${q}`
  ];
}

function isHtml(payload) {
  return typeof payload === "string" && /^\s*</.test(payload);
}

// Very forgiving table scraper for the OllyLookup results grid
function scrapeTable(html) {
  const $ = cheerio.load(html);

  // collect rows (skip header)
  const rows = [];
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length >= 3) {
      // Try to extract useful cells; fall back robustly
      const td0 = $(tds[0]).text().replace(/\s+/g, " ").trim(); // ticker or "N/A"
      const td1 = $(tds[1]).text().replace(/\s+/g, " ").trim(); // company name
      const td2 = $(tds[2]).text().replace(/\s+/g, " ").trim(); // exchange
      const td3 = tds[3] ? $(tds[3]).text().replace(/\s+/g, " ").trim() : ""; // CIK
      if (td1) {
        rows.push({
          ticker: td0 || "N/A",
          companyName: td1 || "N/A",
          exchange: td2 || "N/A",
          cik: (td3 || "").replace(/[^\d]/g, "")
        });
      }
    }
  });

  // also try any data embedded in scripts as JSON
  const inScript = [];
  $('script').each((_, el) => {
    const txt = $(el).html() || "";
    // look for small arrays like results: [...]
    const m = txt.match(/results\s*:\s*(\[[\s\S]*?\])/i) || txt.match(/items\s*:\s*(\[[\s\S]*?\])/i);
    if (m) {
      try {
        const arr = JSON.parse(m[1]);
        if (Array.isArray(arr)) {
          arr.forEach(o => inScript.push(o));
        }
      } catch {}
    }
  });

  return { rows, inScript };
}

function scoreName(candidate, target) {
  const a = (candidate || "").toLowerCase();
  const b = (target || "").toLowerCase();
  if (a === b) return 100;
  if (a.includes(b)) return 90;
  if (b.includes(a)) return 85;

  // fuzzy-ish token overlap
  const at = a.split(/[^a-z0-9]+/).filter(Boolean);
  const bt = b.split(/[^a-z0-9]+/).filter(Boolean);
  if (!at.length || !bt.length) return 0;
  const setB = new Set(bt);
  let hit = 0;
  at.forEach(t => { if (setB.has(t)) hit++; });
  const overlap = hit / Math.max(at.length, bt.length);
  return Math.round(overlap * 80);
}

function pickBest(items, name) {
  if (!items || !items.length) return null;
  let best = null, bestScore = -1;
  for (const it of items) {
    const cname = it.companyName || it.name || "";
    const s = scoreName(cname, name);
    if (s > bestScore) { best = it; bestScore = s; }
  }
  return best;
}

async function queryOne(baseUrl, param, name) {
  const urls = buildUrls(baseUrl, param, name);

  for (const url of urls) {
    try {
      const res = await axios.get(url, {
        headers: {
          "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
          "User-Agent": "OllyLookup-F500-Runner"
        },
        validateStatus: () => true
      });

      const status = res.status;

      // JSON shapes
      if (Array.isArray(res.data)) {
        const best = pickBest(res.data, name);
        if (best) {
          return { ok: true, data: {
            input_name: name,
            matched_name: best.companyName || best.name || "N/A",
            ticker: best.ticker || best.symbol || "N/A",
            exchange: best.exchange || best.listing || "N/A",
            cik: best.cik || "",
            http_status: status,
            endpoint_used: url,
            source: "json-array"
          }};
        }
      }
      if (res.data && typeof res.data === "object") {
        const arr = res.data.results || res.data.items;
        if (Array.isArray(arr) && arr.length) {
          const best = pickBest(arr, name);
          if (best) {
            return { ok: true, data: {
              input_name: name,
              matched_name: best.companyName || best.name || "N/A",
              ticker: best.ticker || best.symbol || "N/A",
              exchange: best.exchange || best.listing || "N/A",
              cik: best.cik || "",
              http_status: status,
              endpoint_used: url,
              source: "json-field"
            }};
          }
        }
      }

      // HTML fall-back: parse table
      if (isHtml(res.data)) {
        const { rows, inScript } = scrapeTable(res.data);

        // try table rows first
        if (rows.length) {
          const best = pickBest(rows, name);
          if (best) {
            return { ok: true, data: {
              input_name: name,
              matched_name: best.companyName || "N/A",
              ticker: best.ticker || "N/A",
              exchange: best.exchange || "N/A",
              cik: best.cik || "",
              http_status: status,
              endpoint_used: url,
              source: "html-table"
            }};
          }
        }

        // try any script-embedded JSON
        if (inScript.length) {
          const best = pickBest(inScript, name);
          if (best) {
            return { ok: true, data: {
              input_name: name,
              matched_name: best.companyName || best.name || "N/A",
              ticker: best.ticker || best.symbol || "N/A",
              exchange: best.exchange || best.listing || "N/A",
              cik: best.cik || "",
              http_status: status,
              endpoint_used: url,
              source: "html-script-json"
            }};
          }
        }
      }

      // else: try next URL
    } catch (e) {
      // continue to next URL
    }
  }

  return {
    ok: false,
    data: {
      input_name: name,
      matched_name: "N/A",
      ticker: "N/A",
      exchange: "N/A",
      cik: "",
      http_status: "ERR",
      endpoint_used: "",
      source: "none"
    }
  };
}

// simple concurrency without p-limit
async function runWithConcurrency(tasks, limit, onProgress) {
  let idx = 0, active = 0, results = [];
  return new Promise((resolve) => {
    function next() {
      if (idx >= tasks.length && active === 0) return resolve(results);
      while (active < limit && idx < tasks.length) {
        const cur = idx++;
        active++;
        tasks[cur]().then(r => {
          results[cur] = r;
          active--;
          onProgress(cur, r);
          next();
        });
      }
    }
    next();
  });
}

(async function main() {
  const { inFile, outCsv, baseUrl, concurrency, param } = parseArgs();
  const names = readNames(inFile);
  if (!names.length) die("No names found in input file");

  const bar = new cliProgress.SingleBar({
    format: "Progress {bar} {percentage}% | {value}/{total} | ok:{ok} miss:{miss} | {name}",
    hideCursor: true
  }, cliProgress.Presets.shades_classic);
  bar.start(names.length, 0, { ok: 0, miss: 0, name: "" });

  let ok = 0, miss = 0;
  const rows = [];

  const tasks = names.map((name, idx) => async () => {
    const r = await queryOne(baseUrl, param, name);
    rows[idx] = {
      input_name: r.data.input_name,
      query_used: name,
      param,
      matched_name: r.data.matched_name,
      ticker: r.data.ticker,
      exchange: r.data.exchange,
      cik: r.data.cik,
      http_status: r.data.http_status,
      endpoint_used: r.data.endpoint_used,
      source: r.data.source
    };
    if (r.ok) ok++; else miss++;
    bar.update(idx + 1, { ok, miss, name: name.slice(0, 20) });
    return r;
  });

  await runWithConcurrency(tasks, concurrency, () => {});
  bar.stop();

  const csv = Papa.unparse(rows, { header: true });
  fs.writeFileSync(outCsv, csv, "utf8");
  const sidecar = outCsv.replace(/\.csv$/i, ".json");
  fs.writeFileSync(sidecar, JSON.stringify({ baseUrl, param, rows }, null, 2), "utf8");

  console.log("\n— Summary —");
  console.log(`✅ Matched: ${ok}`);
  console.log(`❌ Misses:  ${miss}`);
  console.log(`🗂️  CSV:    ${path.resolve(outCsv)}`);
  console.log(`🧩 JSON:    ${path.resolve(sidecar)}\n`);
})();
