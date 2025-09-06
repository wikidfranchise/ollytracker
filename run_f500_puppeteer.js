#!/usr/bin/env node
/**
 * Faster Fortune 500 batch lookup via OllyLookup (headless)
 * - Ensures it uses the exact input file you pass
 * - Shows the first few names it loaded
 * - Page pool (tabs) for concurrency
 * - Blocks non-essential assets to speed up
 * Usage:
 *   node run_f500_puppeteer.js <input_txt> <output_csv> <base_url> [--concurrency 6] [--param q]
 */

const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");
const cliProgress = require("cli-progress");
const puppeteer = require("puppeteer");

function die(msg) { console.error(msg); process.exit(1); }

function parseArgs() {
  const [,, inFile, outCsv, baseUrl, ...rest] = process.argv;
  if (!inFile || !outCsv || !baseUrl) {
    die("Usage: node run_f500_puppeteer.js <input_txt> <output_csv> <base_url> [--concurrency 6] [--param q]");
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
  if (!fs.existsSync(filePath)) die(`Input file not found: ${filePath}`);
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  // If there is a header "Name", drop it
  const start = (lines[0].toLowerCase() === "name") ? 1 : 0;
  const names = lines.slice(start);
  if (!names.length) die("No company names found in input file.");
  return names;
}

function buildUrl(baseUrl, param, name) {
  const clean = baseUrl.replace(/\/+$/, "");
  return `${clean}?${param}=${encodeURIComponent(name)}`;
}

async function preparePage(page) {
  // Block non-essential requests
  await page.setRequestInterception(true);
  page.on("request", req => {
    const type = req.resourceType();
    if (type === "image" || type === "stylesheet" || type === "font" || type === "media") {
      return req.abort();
    }
    req.continue();
  });
  await page.setUserAgent("OllyLookup-F500-Runner/puppeteer");
  await page.setCacheEnabled(true);
  page.setDefaultTimeout(15000);
}

async function scrapeOne(page, url, inputName) {
  const started = Date.now();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

    // Wait up to 7.5s total for a table with at least one <tbody><tr>
    let hadRows = false;
    try {
      await page.waitForFunction(() => {
        const tbl = document.querySelector("table");
        if (!tbl) return false;
        const rows = tbl.querySelectorAll("tbody tr");
        return rows && rows.length > 0;
      }, { timeout: 7500 });
      hadRows = true;
    } catch (_) {}

    if (!hadRows) {
      // Try a broader selector in case markup differs
      try {
        await page.waitForSelector("tbody tr", { timeout: 4000 });
        hadRows = true;
      } catch (_) {}
    }

    if (!hadRows) {
      return {
        ok: false,
        data: {
          input_name: inputName, query_used: inputName, matched_name: "N/A",
          ticker: "N/A", exchange: "N/A", cik: "", http_status: 200,
          endpoint_used: url, source: "no-rows"
        },
        ms: Date.now() - started
      };
    }

    // Extract first/best row
    const rows = await page.$$eval("table tbody tr", trs => {
      return trs.map(tr => {
        const tds = Array.from(tr.querySelectorAll("td"));
        const cell = i => (tds[i]?.textContent || "").replace(/\s+/g, " ").trim();
        const ticker = cell(0) || "N/A";
        const companyName = cell(1) || "N/A";
        const exchange = cell(2) || "N/A";
        const cik = (cell(3) || "").replace(/[^\d]/g, "");
        return { ticker, companyName, exchange, cik };
      });
    });

    // Choose best match
    const lower = inputName.toLowerCase();
    const exact = rows.find(r => r.companyName.toLowerCase() === lower);
    const contains = rows.find(r => r.companyName.toLowerCase().includes(lower));
    const best = exact || contains || rows[0];

    return {
      ok: true,
      data: {
        input_name: inputName,
        query_used: inputName,
        matched_name: best.companyName || "N/A",
        ticker: best.ticker || "N/A",
        exchange: best.exchange || "N/A",
        cik: best.cik || "",
        http_status: 200,
        endpoint_used: url,
        source: "puppeteer-html"
      },
      ms: Date.now() - started
    };

  } catch (e) {
    return {
      ok: false,
      data: {
        input_name: inputName, query_used: inputName, matched_name: "N/A",
        ticker: "N/A", exchange: "N/A", cik: "", http_status: "ERR",
        endpoint_used: url, source: "error"
      },
      err: String(e),
      ms: Date.now() - started
    };
  }
}

async function runPool(names, baseUrl, param, concurrency, bar) {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  // Create page pool
  const pages = [];
  for (let i = 0; i < concurrency; i++) {
    const p = await browser.newPage();
    await preparePage(p);
    pages.push(p);
  }

  const results = new Array(names.length);
  let ok = 0, miss = 0;
  let next = 0;

  async function worker(pageIdx) {
    const page = pages[pageIdx];
    while (true) {
      const i = next++;
      if (i >= names.length) return;
      const name = names[i];
      const url = buildUrl(baseUrl, param, name);
      const res = await scrapeOne(page, url, name);
      results[i] = {
        input_name: res.data.input_name,
        query_used: res.data.query_used,
        param,
        matched_name: res.data.matched_name,
        ticker: res.data.ticker,
        exchange: res.data.exchange,
        cik: res.data.cik,
        http_status: res.data.http_status,
        endpoint_used: res.data.endpoint_used,
        source: res.data.source
      };
      if (res.ok) ok++; else miss++;
      bar.increment(1, { ok, miss, name: name.slice(0, 28) });
    }
  }

  await Promise.all(pages.map((_, idx) => worker(idx)));
  await browser.close();
  return { results, ok, miss };
}

(async function main() {
  const { inFile, outCsv, baseUrl, concurrency, param } = parseArgs();
  const names = readNames(inFile);

  // Show what we’re about to process (to avoid “wrong list” surprises)
  console.log("— Run Config —");
  console.log(`Input:  ${path.resolve(inFile)}`);
  console.log(`Output: ${path.resolve(outCsv)}`);
  console.log(`URL:    ${baseUrl} (param=${param})`);
  console.log(`Total:  ${names.length} names`);
  console.log(`First5: ${names.slice(0,5).join(" | ")}`);
  console.log(`Last:   ${names[names.length-1]}`);
  console.log();

  const bar = new cliProgress.SingleBar({
    format: "Progress {bar} {percentage}% | {value}/{total} | ok:{ok} miss:{miss} | {name}",
    hideCursor: true
  }, cliProgress.Presets.shades_classic);
  bar.start(names.length, 0, { ok: 0, miss: 0, name: "" });

  const { results, ok, miss } = await runPool(names, baseUrl, param, Math.max(1, Math.min(concurrency, 8)), bar);
  bar.stop();

  // Write CSV + JSON sidecar
  const csv = Papa.unparse(results, { header: true });
  fs.writeFileSync(outCsv, csv, "utf8");
  const sidecar = outCsv.replace(/\.csv$/i, ".json");
  fs.writeFileSync(sidecar, JSON.stringify({ baseUrl, param, results }, null, 2), "utf8");

  console.log("\n— Summary —");
  console.log(`✅ Matched: ${ok}`);
  console.log(`❌ Misses:  ${miss}`);
  console.log(`🗂️  CSV:    ${path.resolve(outCsv)}`);
  console.log(`🧩 JSON:    ${path.resolve(sidecar)}\n`);
})();
