#!/usr/bin/env node
// Dev-only link checker. NOT part of the published site, and not a runtime
// dependency: it drives Playwright over every official URL in data/certs.csv to
// catch dead links, wrong redirects and retired pages before they ship.
//
//   npm run links            check every cert URL
//   npm run links -- oscp    check only the rows whose id contains "oscp"
//
// Many vendor sites block non-browser clients, so each URL is tried first with a
// fast HTTP request and, if that is refused, again through a real Chromium tab.
// A page that only loads in the browser is reported as "blocked" (a warning), not
// a failure; genuine 404/410/5xx and DNS/timeout errors fail the run.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { request, chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, "..", "data", "certs.csv");

const CONCURRENCY = 8;
const HTTP_TIMEOUT = 15000;
const BROWSER_TIMEOUT = 20000;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function parseCSV(text) {
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function loadTargets(filter) {
  const rows = parseCSV(readFileSync(CSV_PATH, "utf8"));
  const header = rows.shift();
  const idIdx = header.indexOf("id");
  const urlIdx = header.indexOf("url");
  const seen = new Set();
  const targets = [];
  for (const r of rows) {
    const id = (r[idIdx] || "").trim();
    const url = (r[urlIdx] || "").trim();
    if (!url || seen.has(url)) continue;
    if (filter && !id.includes(filter)) continue;
    seen.add(url);
    targets.push({ id, url });
  }
  return targets;
}

const sameUrl = (a, b) => a.replace(/\/+$/, "") === b.replace(/\/+$/, "");

async function checkHttp(ctx, url) {
  try {
    const res = await ctx.get(url, { timeout: HTTP_TIMEOUT, maxRedirects: 6 });
    return { status: res.status(), final: res.url() };
  } catch (err) {
    return { status: 0, error: err.message.split("\n")[0] };
  }
}

async function checkBrowser(browser, url) {
  const page = await browser.newPage({ userAgent: UA });
  try {
    const res = await page.goto(url, { timeout: BROWSER_TIMEOUT, waitUntil: "domcontentloaded" });
    return { status: res ? res.status() : 0, final: page.url() };
  } catch (err) {
    return { status: 0, error: err.message.split("\n")[0] };
  } finally {
    await page.close();
  }
}

async function classify(ctx, browser, target) {
  const http = await checkHttp(ctx, target.url);
  if (http.status >= 200 && http.status < 400) {
    const redirected = http.final && !sameUrl(http.final, target.url);
    return { ...target, state: redirected ? "redirect" : "ok", status: http.status, final: http.final };
  }
  // Refused or errored over plain HTTP: confirm with a real browser tab.
  const br = await checkBrowser(browser, target.url);
  if (br.status >= 200 && br.status < 400) {
    return { ...target, state: "blocked", status: br.status, final: br.final };
  }
  const status = br.status || http.status;
  return { ...target, state: "broken", status, error: br.error || http.error };
}

async function runPool(items, worker) {
  const results = [];
  let next = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const filter = process.argv[2];
  const targets = loadTargets(filter);
  if (!targets.length) {
    console.log("No URLs to check.");
    return;
  }
  console.log(`Checking ${targets.length} URL(s)…\n`);

  const ctx = await request.newContext({ extraHTTPHeaders: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
  const browser = await chromium.launch();

  let done = 0;
  const results = await runPool(targets, async t => {
    const r = await classify(ctx, browser, t);
    done++;
    const mark = { ok: "ok ", redirect: "→  ", blocked: "·  ", broken: "XXX" }[r.state];
    process.stdout.write(`[${String(done).padStart(3)}/${targets.length}] ${mark} ${r.id} (${r.status || r.error})\n`);
    return r;
  });

  await ctx.dispose();
  await browser.close();

  const broken = results.filter(r => r.state === "broken");
  const redirects = results.filter(r => r.state === "redirect");
  const blocked = results.filter(r => r.state === "blocked");
  const ok = results.filter(r => r.state === "ok");

  console.log(`\nSummary: ${ok.length} ok · ${redirects.length} redirect · ${blocked.length} blocked · ${broken.length} broken`);

  if (redirects.length) {
    console.log("\nRedirects (consider updating the URL to its destination):");
    for (const r of redirects) console.log(`  ${r.id}\n    ${r.url}\n    -> ${r.final}`);
  }
  if (blocked.length) {
    console.log("\nBlocked to the checker but reachable in a browser:");
    for (const r of blocked) console.log(`  ${r.id} (${r.status})  ${r.url}`);
  }
  if (broken.length) {
    console.log("\nBROKEN:");
    for (const r of broken) console.log(`  ${r.id} (${r.status || "error"})  ${r.url}  ${r.error || ""}`);
    process.exitCode = 1;
  }
}

main().catch(err => { console.error(err); process.exit(1); });
