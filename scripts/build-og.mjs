#!/usr/bin/env node
// Renders the social preview card (assets/og.png, 1200x630) with Playwright.
// Dev-only: run `npm run og` after the certification count changes noticeably.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { parseCSV, rowsToCerts, DOMAINS } from "../assets/js/data.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const certs = rowsToCerts(parseCSV(readFileSync(join(ROOT, "data", "certs.csv"), "utf8")));
const vendors = new Set(certs.map(c => c.vendor)).size;
const LEVELS = ["expert", "advanced", "intermediate", "beginner"];
const COLOR = { expert: "#9a6e6e", advanced: "#846a99", intermediate: "#5b6e96", beginner: "#4f7a63" };

// A miniature of the real matrix: one dot per certification, by domain and level.
const cells = LEVELS.map(level => DOMAINS.map(domain => {
  const n = certs.filter(c => c.domain === domain && c.level === level).length;
  return `<div class="cell">${`<i style="background:${COLOR[level]}"></i>`.repeat(Math.min(n, 12))}</div>`;
}).join("")).join("");

const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0b0d12;color:#e6e8ec;font-family:-apple-system,"Segoe UI",Inter,sans-serif;padding:64px 72px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:18px;font:700 34px ui-monospace,Menlo,monospace;letter-spacing:-.02em}
.brand b{color:#8aa9d4;font-weight:700}
h1{font-size:68px;line-height:1.05;letter-spacing:-.03em;max-width:900px}
p{font-size:28px;color:#b3b9c5;margin-top:18px}
.grid{display:grid;grid-template-columns:repeat(${DOMAINS.length},1fr);gap:6px}
.cell{height:30px;background:#13171f;border:1px solid #232a37;border-radius:5px;display:flex;flex-wrap:wrap;align-content:center;gap:2px;padding:3px}
.cell i{width:5px;height:5px;border-radius:1.5px}
</style>
<div class="brand"><svg width="56" height="56" viewBox="0 0 32 32"><rect x="1" y="1" width="30" height="30" rx="8" fill="#181d27" stroke="#2e3645"/><g fill="#2e3645"><circle cx="9" cy="9" r="1.5"/><circle cx="16" cy="9" r="1.5"/><circle cx="9" cy="16" r="1.5"/><circle cx="23" cy="16" r="1.5"/><circle cx="16" cy="23" r="1.5"/><circle cx="23" cy="23" r="1.5"/></g><path d="M9 23H16V16H23V9" fill="none" stroke="#8aa9d4" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="23" r="2.2" fill="#8aa9d4"/><circle cx="16" cy="16" r="1.8" fill="#8aa9d4"/><circle cx="23" cy="9" r="3" fill="#a8c1e6" stroke="#181d27" stroke-width="1.5"/></svg><span>cert<b>/</b>map</span></div>
<div><h1>Cybersecurity Certification Roadmap</h1><p>${certs.length} certifications · ${vendors} vendors · ${DOMAINS.length} domains · current exam prices</p></div>
<div class="grid">${cells}</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: join(ROOT, "assets", "og.png") });
await browser.close();
console.log(`OK: assets/og.png (${certs.length} certifications, ${vendors} vendors).`);
