#!/usr/bin/env node
// Data-quality report for data/resources.csv. Dev-only, no dependencies.
//
//   node scripts/check-resources.mjs            structure checks only
//   node scripts/check-resources.mjs --links    also request every URL
//
// Structure: unknown cert ids, bad types, empty fields, duplicate rows, the
// same URL filed under different titles, certifications with very few
// resources, and how the rows split by type and flag.
// Links: each URL is requested once (HEAD, then GET if the server refuses
// HEAD). 2xx and 3xx count as reachable. 401, 403 and 429 are reported as
// "refused": the page exists but the site blocks automated requests, which is
// common for vendor help centres and lab platforms. Everything else is "dead".
// The exit status is non-zero only for structural errors and dead links.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCSV, rowsToCerts, tableFromCSV, RESOURCE_TYPES } from "../assets/js/data.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = f => readFileSync(join(ROOT, "data", f), "utf8");
const certs = rowsToCerts(parseCSV(read("certs.csv")));
const ids = new Set(certs.map(c => c.id));
const rows = tableFromCSV(read("resources.csv"));
const checkLinks = process.argv.includes("--links");

const errors = [], warnings = [];
const count = (list, f) => list.reduce((m, x) => m.set(f(x), (m.get(f(x)) || 0) + 1), new Map());
const table = m => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k || "(empty)"} ${v}`).join(", ");

// ---------- structure ----------
const seenRow = new Set();
const titlesByUrl = new Map();
rows.forEach((r, i) => {
  const where = `L${i + 2} [${r.cert_id}]`;
  if (!ids.has(r.cert_id)) errors.push(`${where}: unknown cert id`);
  if (!RESOURCE_TYPES.includes(r.type)) errors.push(`${where}: unknown type "${r.type}"`);
  if (!r.title || !r.provider) errors.push(`${where}: empty title or provider`);
  if (!/^https:\/\/[^\s<>"]+$/.test(r.url)) errors.push(`${where}: url is not https`);
  for (const k of ["free", "official", "sponsored"]) if (!["true", "false", ""].includes(r[k])) errors.push(`${where}: ${k} is "${r[k]}"`);
  const key = r.cert_id + "|" + r.url;
  if (seenRow.has(key)) errors.push(`${where}: duplicate of an earlier row (${r.url})`);
  seenRow.add(key);
  if (!titlesByUrl.has(r.url)) titlesByUrl.set(r.url, new Set());
  titlesByUrl.get(r.url).add(r.title);
});
for (const [url, titles] of titlesByUrl) if (titles.size > 1) warnings.push(`same URL under ${titles.size} titles: ${url} (${[...titles].join(" / ")})`);

const perCert = count(rows, r => r.cert_id);
const thin = [...perCert.entries()].filter(([, n]) => n < 3).map(([id, n]) => `${id} (${n})`);
const unknownFree = rows.filter(r => r.free === "").length;

console.log(`Rows: ${rows.length}. Certifications covered: ${perCert.size} of ${certs.length} (${(100 * perCert.size / certs.length).toFixed(1)}%).`);
console.log(`Distinct URLs: ${titlesByUrl.size}. Distinct hosts: ${new Set(rows.map(r => { try { return new URL(r.url).host; } catch { return "?"; } })).size}.`);
console.log(`By type: ${table(count(rows, r => r.type))}`);
console.log(`Free: ${table(count(rows, r => r.free))}. Official: ${table(count(rows, r => r.official))}. Sponsored: ${table(count(rows, r => r.sponsored))}`);
console.log(`Resources per certification: min ${Math.min(...perCert.values())}, median ${[...perCert.values()].sort((a, b) => a - b)[Math.floor(perCert.size / 2)]}, max ${Math.max(...perCert.values())}.`);
if (thin.length) warnings.push(`fewer than 3 resources: ${thin.join(", ")}`);
if (unknownFree) warnings.push(`${unknownFree} rows do not say whether the resource is free`);

// ---------- links ----------
let dead = [];
if (checkLinks) {
  const urls = [...titlesByUrl.keys()];
  const UA = "Mozilla/5.0 (compatible; link-check)";
  const result = new Map();
  async function probe(url) {
    for (const method of ["HEAD", "GET"]) {
      try {
        const res = await fetch(url, { method, redirect: "follow", headers: { "user-agent": UA, accept: "text/html,*/*" }, signal: AbortSignal.timeout(20000) });
        if (res.status < 400) return { status: res.status, kind: "ok" };
        if ([401, 403, 429].includes(res.status)) { if (method === "GET") return { status: res.status, kind: "refused" }; continue; }
        if (method === "GET" || ![405, 501].includes(res.status)) { if (method === "HEAD") continue; return { status: res.status, kind: "dead" }; }
      } catch (e) {
        if (method === "GET") return { status: e.name === "TimeoutError" ? "timeout" : "error", kind: "dead" };
      }
    }
    return { status: "error", kind: "dead" };
  }
  const queue = [...urls];
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (queue.length) { const u = queue.shift(); result.set(u, await probe(u)); }
  }));
  const kinds = count([...result.values()], r => r.kind);
  console.log(`Links: ${table(kinds)} of ${urls.length}.`);
  const refused = [...result.entries()].filter(([, r]) => r.kind === "refused");
  if (refused.length) console.log(`Refused automated requests (${refused.length}), by host: ${table(count(refused, ([u]) => new URL(u).host))}`);
  dead = [...result.entries()].filter(([, r]) => r.kind === "dead");
  for (const [u, r] of dead) errors.push(`dead link (${r.status}): ${u}`);
}

for (const w of warnings) console.log("warn  " + w);
for (const e of errors) console.log("FAIL  " + e);
console.log(errors.length ? `\n${errors.length} problem(s).` : `\nOK${checkLinks ? ", every link answered" : ""}.`);
process.exit(errors.length ? 1 : 0);
