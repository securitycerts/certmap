#!/usr/bin/env node
// Renders the social preview cards with Playwright: assets/og.png for the site
// assets/og/path-<id>.png for each preset path and assets/og/shared.png for
// shared roadmap links (all 1200x630).
// Dev-only: run `npm run og` after the certification count changes noticeably.

import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";
import { parseCSV, rowsToCerts, DOMAINS } from "../assets/js/data.js";
import { ROLE_PATHS, orderByPrerequisite, pathTotals } from "../assets/js/paths.js";

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

const MARK = html.match(/<svg[\s\S]*?<\/svg>/)[0];
const byId = new Map(certs.map(c => [c.id, c]));
const money = n => (n == null ? "price n/a" : n === 0 ? "Free" : "$" + n.toLocaleString("en-US"));

// One card per preset path, used as the link preview of certs/path-<id>.html.
function pathCard(p) {
  const items = orderByPrerequisite(p.certs.map(id => byId.get(id)).filter(Boolean));
  const t = pathTotals(items);
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0b0d12;color:#e6e8ec;font-family:-apple-system,"Segoe UI",Inter,sans-serif;padding:60px 64px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px;font:700 30px ui-monospace,Menlo,monospace;letter-spacing:-.02em}
.brand b{color:#8aa9d4;font-weight:700}
.kicker{font-size:20px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8aa9d4;margin-bottom:10px}
h1{font-size:64px;line-height:1.05;letter-spacing:-.03em}
p{font-size:26px;color:#b3b9c5;margin-top:14px}
.steps{display:flex;align-items:stretch;gap:10px}
.step{flex:1;min-width:0;background:#13171f;border:1px solid #232a37;border-top:4px solid var(--c);border-radius:10px;padding:14px 16px}
.step small{display:block;font-size:13px;font-weight:600;letter-spacing:.08em;color:#7d8595}
.step strong{display:block;font:700 26px ui-monospace,Menlo,monospace;margin:4px 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.step span{font-size:16px;color:#b3b9c5;white-space:nowrap}
.arrow{align-self:center;color:#2e3645;font-size:26px}
</style>
<div class="brand">${MARK.replace('width="56" height="56"', 'width="48" height="48"')}<span>cert<b>/</b>map</span></div>
<div><div class="kicker">Certification path</div><h1>${p.name}</h1><p>${items.length} certifications · ${t.hours}h of study · $${t.cost.toLocaleString("en-US")} in exam fees</p></div>
<div class="steps">${items.map((c, i) => `<div class="step" style="--c:${COLOR[c.level]}"><small>STEP ${i + 1}</small><strong>${c.acronym}</strong><span>${money(c.price_usd)}</span></div>`).join('<div class="arrow">›</div>')}</div>`;
}

// The card for /r/, the page every shared roadmap link goes through. It cannot
// show the roadmap itself (that lives in the URL fragment), so it shows what the
// link is: a path of steps, shared with you.
function sharedCard() {
  const levels = ["beginner", "beginner", "intermediate", "advanced", "expert"];
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:#0b0d12;color:#e6e8ec;font-family:-apple-system,"Segoe UI",Inter,sans-serif;padding:60px 64px;display:flex;flex-direction:column;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px;font:700 30px ui-monospace,Menlo,monospace;letter-spacing:-.02em}
.brand b{color:#8aa9d4;font-weight:700}
.kicker{font-size:20px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#8aa9d4;margin-bottom:10px}
h1{font-size:66px;line-height:1.05;letter-spacing:-.03em;max-width:980px}
p{font-size:26px;color:#b3b9c5;margin-top:14px}
.steps{display:flex;align-items:center;gap:10px}
.step{flex:1;height:86px;background:#13171f;border:1px solid #232a37;border-top:4px solid var(--c);border-radius:10px;padding:14px 16px}
.step small{display:block;font-size:13px;font-weight:600;letter-spacing:.08em;color:#7d8595}
.step i{display:block;height:12px;margin-top:12px;border-radius:6px;background:#232a37;width:var(--w)}
.arrow{color:#8aa9d4;font-size:26px}
</style>
<div class="brand">${MARK.replace('width="56" height="56"', 'width="48" height="48"')}<span>cert<b>/</b>map</span></div>
<div><div class="kicker">Shared with you</div><h1>A cybersecurity certification roadmap</h1><p>The certifications in order, with the exam cost and study time of the whole path</p></div>
<div class="steps">${levels.map((l, i) => `<div class="step" style="--c:${COLOR[l]};--w:${[58, 72, 50, 80, 64][i]}%"><small>STEP ${i + 1}</small><i></i></div>`).join('<div class="arrow">›</div>')}</div>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.screenshot({ path: join(ROOT, "assets", "og.png") });
mkdirSync(join(ROOT, "assets", "og"), { recursive: true });
await page.setContent(sharedCard());
await page.screenshot({ path: join(ROOT, "assets", "og", "shared.png") });
for (const p of ROLE_PATHS) {
  await page.setContent(pathCard(p));
  await page.screenshot({ path: join(ROOT, "assets", "og", `path-${p.id}.png`) });
}
await browser.close();
console.log(`OK: assets/og.png and ${ROLE_PATHS.length} path cards (${certs.length} certifications, ${vendors} vendors).`);
