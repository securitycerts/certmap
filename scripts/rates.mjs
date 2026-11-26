// Converts the prices that issuers publish in another currency into US dollars.
//
// Each such row keeps the issuer's own figure in `price_original` and `currency`.
// This script asks Frankfurter (https://frankfurter.dev), a free public API that
// republishes the European Central Bank reference rates, for today's rates,
// writes them to data/rates.json and recomputes `price_usd` for those rows. If
// the API cannot be reached, nothing is changed and the last rates stay in use.
//
// It also stores the dollar rate of every currency Frankfurter covers, and the
// Argentine "dolar tarjeta" (the rate for card payments abroad) from DolarApi
// (https://dolarapi.com), so the app can show prices in the viewer's currency.
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

const previous = (() => { try { return JSON.parse(readFileSync(RATES, "utf8")); } catch { return {}; } })();
const get = async url => {
  const res = await fetch(url, { headers: { "User-Agent": "certmap rates (https://certmap.dev/)" }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
};

let rates;
try {
  const url = `${API}?base=USD`;
  const body = await get(url);
  // The API gives units of each currency per dollar; the site needs dollars per unit.
  const usd_per = Object.fromEntries(codes.map(c => {
    const v = body.rates?.[c];
    if (!(v > 0)) throw new Error(`no rate for ${c}`);
    return [c, Number((1 / v).toFixed(6))];
  }));
  const per_usd = Object.fromEntries(Object.entries(body.rates || {}).filter(([c, v]) => /^[A-Z]{3}$/.test(c) && v > 0).sort());
  rates = { source: "Frankfurter, European Central Bank reference rates", url: "https://frankfurter.dev/", date: body.date, usd_per, per_usd };
} catch (err) {
  console.warn(`Rates not updated (${err.message}); keeping data/rates.json as it is.`);
  process.exit(0);
}

// Argentine peso: what someone in Argentina pays for an exam charged in dollars
// on a card. The official selling rate comes from the API every day; the card
// adds a tax on top, set here so it can be changed in one place when the rule
// changes.
const ARS_CARD_TAX = {
  pct: 30,
  name: "percepción de Ganancias o Bienes Personales",
  rule: "ARCA RG 5617/2024",
};
try {
  const t = await get("https://dolarapi.com/v1/dolares/oficial");
  if (!(t.venta > 0)) throw new Error("no venta");
  rates.per_usd.ARS = Math.round(t.venta * (1 + ARS_CARD_TAX.pct / 100) * 100) / 100;
  rates.ars = {
    kind: "dolar tarjeta", official: t.venta, tax_pct: ARS_CARD_TAX.pct, tax: ARS_CARD_TAX.name, rule: ARS_CARD_TAX.rule,
    source: "DolarApi (Banco Nación official rate)", url: "https://dolarapi.com/", date: String(t.fechaActualizacion || "").slice(0, 10),
  };
} catch (err) {
  if (previous.per_usd?.ARS) { rates.per_usd.ARS = previous.per_usd.ARS; rates.ars = previous.ars; }
  console.warn(`ARS card rate not updated (${err.message}).`);
}
rates.per_usd = Object.fromEntries(Object.entries(rates.per_usd).sort());

const quote = v => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
let changed = 0;
for (const r of foreign) {
  const usd = String(Math.round(Number(r[iOrig]) * rates.usd_per[r[iCur]]));
  if (r[iUsd] !== usd) { r[iUsd] = usd; changed++; }
}
writeFileSync(CSV, rows.map(r => r.map(v => quote(v ?? "")).join(",")).join("\n") + "\n");
writeFileSync(RATES, JSON.stringify(rates, null, 1) + "\n");
console.log(`Rates of ${rates.date} (${codes.map(c => `1 ${c} = $${rates.usd_per[c]}`).join(", ")}); ${changed} of ${foreign.length} USD prices changed.`);
