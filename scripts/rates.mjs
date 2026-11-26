// Converts the prices that issuers publish in another currency into US dollars.
//
// Each such row keeps the issuer's own figure in `price_original` and `currency`.
// This script asks Frankfurter (https://frankfurter.dev), a free public API that
// republishes the European Central Bank reference rates, for today's rates,
// writes them to data/rates.json and recomputes `price_usd` for those rows. If
// the API cannot be reached, nothing is changed and the last rates stay in use.
//
// Usage: node scripts/rates.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCSV } from "../assets/js/data.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = join(ROOT, "data", "certs.csv");
const RATES = join(ROOT, "data", "rates.json");
const API = "https://api.frankfurter.dev/v1/latest";

const rows = parseCSV(readFileSync(CSV, "utf8")).filter(r => r.length > 1);
const header = rows[0].map(h => h.trim());
const col = name => header.indexOf(name);
const [iUsd, iOrig, iCur] = [col("price_usd"), col("price_original"), col("currency")];
if (iOrig < 0 || iCur < 0) throw new Error("certs.csv has no price_original or currency column");

const foreign = rows.slice(1).filter(r => r[iCur] && r[iCur] !== "USD" && r[iOrig] !== "");
const codes = [...new Set(foreign.map(r => r[iCur]))].sort();
if (!codes.every(c => /^[A-Z]{3}$/.test(c))) throw new Error(`bad currency code in ${codes.join(", ")}`);

let rates;
try {
  const url = `${API}?base=USD&symbols=${codes.join(",")}`;
  const res = await fetch(url, { headers: { "User-Agent": "certmap rates (https://certmap.dev/)" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  // The API gives units of each currency per dollar; the site needs dollars per unit.
  const usd_per = Object.fromEntries(codes.map(c => {
    const v = body.rates?.[c];
    if (!(v > 0)) throw new Error(`no rate for ${c}`);
    return [c, Number((1 / v).toFixed(6))];
  }));
  rates = { source: "Frankfurter, European Central Bank reference rates", url: "https://frankfurter.dev/", date: body.date, usd_per };
} catch (err) {
  console.warn(`Rates not updated (${err.message}); keeping data/rates.json as it is.`);
  process.exit(0);
}

const quote = v => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
let changed = 0;
for (const r of foreign) {
  const usd = String(Math.round(Number(r[iOrig]) * rates.usd_per[r[iCur]]));
  if (r[iUsd] !== usd) { r[iUsd] = usd; changed++; }
}
writeFileSync(CSV, rows.map(r => r.map(v => quote(v ?? "")).join(",")).join("\n") + "\n");
writeFileSync(RATES, JSON.stringify(rates, null, 1) + "\n");
console.log(`Rates of ${rates.date} (${codes.map(c => `1 ${c} = $${rates.usd_per[c]}`).join(", ")}); ${changed} of ${foreign.length} USD prices changed.`);
