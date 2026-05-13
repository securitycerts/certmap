#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = join(__dirname, "..", "data", "certs.csv");

const DOMAINS = [
  "Communication & Network Security", "IAM", "Security Architecture & Engineering",
  "Asset Security", "Security & Risk Management",
  "Software Security", "Security Operations", "Cyber Threat Intelligence",
  "Cloud/SysOps", "*nix", "ICS/IoT", "GRC", "Forensics", "Incident Handling",
  "Penetration Testing", "Exploitation"
];
const LEVELS = ["beginner", "intermediate", "advanced", "expert"];
const REQUIRED = [
  "id", "name", "acronym", "vendor", "domain", "level", "price_usd",
  "currency_note", "duration_min", "validity_years", "prerequisites",
  "dod_8140", "url", "description", "tags",
];

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

function main() {
  const csv = readFileSync(CSV_PATH, "utf8");
  const rows = parseCSV(csv);
  const header = rows.shift();
  for (const col of REQUIRED) {
    if (!header.includes(col)) {
      console.error(`Missing required column in CSV header: ${col}`);
      process.exit(1);
    }
  }
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const errors = [];
  const seen = new Set();
  const ids = new Set();

  rows.forEach((r, n) => {
    const line = n + 2;
    const id = r[idx.id]?.trim();
    if (!id) return errors.push(`L${line}: empty id`);
    if (seen.has(id)) errors.push(`L${line}: duplicate id "${id}"`);
    seen.add(id); ids.add(id);

    const domain = r[idx.domain]?.trim();
    if (!DOMAINS.includes(domain)) errors.push(`L${line} [${id}]: unknown domain "${domain}"`);

    const level = r[idx.level]?.trim();
    if (!LEVELS.includes(level)) errors.push(`L${line} [${id}]: unknown level "${level}"`);

    const url = r[idx.url]?.trim();
    if (!/^https?:\/\//.test(url)) errors.push(`L${line} [${id}]: invalid url`);

    const price = r[idx.price_usd]?.trim();
    if (price !== "" && !/^-?\d+(\.\d+)?$/.test(price)) {
      errors.push(`L${line} [${id}]: price_usd is not a number ("${price}")`);
    }

    const dod = r[idx.dod_8140]?.trim().toLowerCase();
    if (dod !== "true" && dod !== "false") {
      errors.push(`L${line} [${id}]: dod_8140 must be "true" or "false", got "${dod}"`);
    }

    if (idx.weight !== undefined) {
      const w = r[idx.weight]?.trim();
      if (w && !/^-?\d+$/.test(w)) {
        errors.push(`L${line} [${id}]: weight must be an integer (or empty), got "${w}"`);
      }
    }
  });

  rows.forEach((r, n) => {
    const line = n + 2;
    const id = r[idx.id]?.trim();
    const prereqs = (r[idx.prerequisites] || "").split(";").map(s => s.trim()).filter(Boolean);
    for (const p of prereqs) {
      if (!ids.has(p)) errors.push(`L${line} [${id}]: prerequisite "${p}" not found in dataset`);
    }
  });

  if (errors.length) {
    console.error("Validation errors:\n" + errors.map(e => "  - " + e).join("\n"));
    process.exit(1);
  }
  console.log(`OK: ${rows.length} certs validated.`);
}

main();
