#!/usr/bin/env node
// Static, crawlable pages generated from data/certs.csv.
//
// The app itself paints everything in the browser from the CSV, so a crawler
// that does not run JavaScript sees an empty shell. This script writes plain
// HTML for the same data:
//
//   certs/index.html     every certification, grouped by domain
//   certs/<id>.html      one page per certification
//   certs/vendor-*.html  one page per vendor
//   certs/domain-*.html  one page per domain
//   sitemap.xml          the home page plus all of the above
//
// It also refreshes the certification count wherever index.html and llms.txt
// quote it. No dependencies; run with `npm run build` after changing the CSV and
// commit the result: the site is published straight from the branch, and CI
// fails if the generated files are stale.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { parseCSV, rowsToCerts, DOMAINS } from "../assets/js/data.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://certmap.dev/";
const OUT = join(ROOT, "certs");
const LEVELS = ["beginner", "intermediate", "advanced", "expert"];
const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", expert: "Expert" };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// JSON-LD sits inside a <script> element, so "<" must not appear literally.
const jsonLd = obj => JSON.stringify(obj).replace(/</g, "\\u003c");
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const money = n => (n == null ? "Not published" : n === 0 ? "Free" : "$" + n.toLocaleString("en-US"));

function duration(min) {
  if (!min) return null;
  if (min < 600) return `${min} minutes`;
  const hours = min / 60;
  return hours % 24 === 0 && hours >= 48 ? `${hours / 24} days` : `${hours} hours`;
}

const certs = rowsToCerts(parseCSV(readFileSync(join(ROOT, "data", "certs.csv"), "utf8")));
const byId = new Map(certs.map(c => [c.id, c]));
const vendors = new Set(certs.map(c => c.vendor));
const latest = certs.map(c => c.price_verified_at).filter(Boolean).sort().pop() || "2026-01-01";
const byName = (a, b) => a.acronym.localeCompare(b.acronym);

function page({ path, title, description, body, ld, modified }) {
  const canonical = SITE + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="cert/map">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}assets/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0b0d12">
<link rel="icon" type="image/svg+xml" href="../favicon/favicon.svg">
<link rel="icon" type="image/x-icon" href="../favicon/favicon.ico">
<link rel="stylesheet" href="../assets/css/static.css">
<script type="application/ld+json">${jsonLd(ld)}</script>
</head>
<body>
<header class="top">
  <a class="brand" href="../">cert<span>/</span>map</a>
  <nav><a href="./">All certifications</a><a href="../">Interactive roadmap</a></nav>
</header>
<main>
${body}
</main>
<footer>
  <p>Part of <a href="../">cert/map</a>, an open-source roadmap of cybersecurity certifications. Prices are list prices in USD and can change, so confirm with the vendor before paying.${modified ? ` Last reviewed ${modified}.` : ""}</p>
  <p><a href="https://github.com/securitycerts/certmap">Source and dataset on GitHub</a></p>
</footer>
</body>
</html>
`;
}

const certLink = c => `<a href="${c.id}.html">${esc(c.acronym)}</a>`;
const vendorFile = v => `vendor-${slug(v)}.html`;
const domainFile = d => `domain-${slug(d)}.html`;
const year = iso => (iso || latest).slice(0, 4);
const count = (list, key) => list.reduce((m, c) => m.set(c[key], (m.get(c[key]) || 0) + 1), new Map());
const byLevelThenName = (a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || byName(a, b);

if (certs.some(c => /^(vendor|domain)-/.test(c.id))) throw new Error("a cert id collides with the vendor-/domain- page names");

function certTable(items, { showVendor = true, showDomain = false } = {}) {
  return `<table>
    <thead><tr><th>Certification</th>${showVendor ? "<th>Vendor</th>" : ""}${showDomain ? "<th>Domain</th>" : ""}<th>Level</th><th>Exam price</th></tr></thead>
    <tbody>
${items.map(c => `      <tr><td>${certLink(c)} <span>${esc(c.name)}</span></td>${showVendor ? `<td><a href="${vendorFile(c.vendor)}">${esc(c.vendor)}</a></td>` : ""}${showDomain ? `<td><a href="${domainFile(c.domain)}">${esc(c.domain)}</a></td>` : ""}<td>${LEVEL_LABEL[c.level]}</td><td>${esc(money(c.price_usd))}</td></tr>`).join("\n")}
    </tbody>
  </table>`;
}

function priceRange(items) {
  const prices = items.map(c => c.price_usd).filter(n => Number.isFinite(n) && n > 0);
  if (!prices.length) return "";
  const lo = Math.min(...prices), hi = Math.max(...prices);
  return lo === hi ? ` Exam price ${money(lo)}.` : ` Exam prices run from ${money(lo)} to ${money(hi)}.`;
}

function itemListLd(name, path, items) {
  return [{
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    url: SITE + path,
    isPartOf: { "@type": "WebSite", name: "cert/map", url: SITE },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: `${c.acronym}: ${c.name}`, url: SITE + `certs/${c.id}.html` })),
    },
  }];
}

function vendorPage(vendor) {
  const items = certs.filter(c => c.vendor === vendor).sort(byLevelThenName);
  const domains = [...count(items, "domain").keys()];
  const path = `certs/${vendorFile(vendor)}`;
  const title = `${vendor} certifications: full list, prices and levels (${year()})`;
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / <a href="./">Certifications</a> / ${esc(vendor)}</nav>
<h1>${esc(vendor)} certifications</h1>
<p class="lead">${items.length === 1 ? "The one" : `All ${items.length}`} ${esc(vendor)} ${items.length === 1 ? "certification" : "certifications"} on the cert/map security certification roadmap, ordered from beginner to expert, with the domain each one belongs to and its current exam price.${esc(priceRange(items))}</p>
<p class="cta"><a class="btn primary" href="../?vendor=${encodeURIComponent(vendor)}">Open ${esc(vendor)} in the interactive roadmap</a></p>
${certTable(items, { showVendor: false, showDomain: true })}
<h2>Domains covered</h2>
<nav class="toc">${domains.map(d => `<a href="${domainFile(d)}">${esc(d)}</a>`).join(" ")}</nav>`;
  return page({
    path, title: `${title} | cert/map`,
    description: `${items.length} ${vendor} ${items.length === 1 ? "certification" : "certifications"} compared: ${items.slice(0, 6).map(c => c.acronym).join(", ")}${items.length > 6 ? " and more" : ""}.${priceRange(items)} Levels, domains and prerequisites.`.slice(0, 300),
    body, ld: itemListLd(`${vendor} certifications`, path, items), modified: latest,
  });
}

function domainPage(domain) {
  const items = certs.filter(c => c.domain === domain).sort(byLevelThenName);
  const path = `certs/${domainFile(domain)}`;
  const levels = LEVELS.filter(l => items.some(c => c.level === l));
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / <a href="./">Certifications</a> / ${esc(domain)}</nav>
<h1>${esc(domain)} certifications</h1>
<p class="lead">${items.length} ${esc(domain)} certifications from ${count(items, "vendor").size} vendors, laid out as a path from beginner to expert with the current exam price of each.${esc(priceRange(items))}</p>
<p class="cta"><a class="btn primary" href="../#/domain/${slug(domain)}">Open ${esc(domain)} in the interactive roadmap</a></p>
${levels.map(l => `<h2>${LEVEL_LABEL[l]} ${esc(domain)} certifications</h2>
${certTable(items.filter(c => c.level === l).sort(byName))}`).join("\n")}
<h2>Other domains</h2>
<nav class="toc">${DOMAINS.filter(d => d !== domain).map(d => `<a href="${domainFile(d)}">${esc(d)}</a>`).join(" ")}</nav>`;
  return page({
    path, title: `${domain} certifications roadmap: ${items.length} certs with prices (${year()}) | cert/map`,
    description: `${domain} certification path from beginner to expert: ${items.slice(0, 6).map(c => c.acronym).join(", ")} and more.${priceRange(items)} ${items.length} certifications from ${count(items, "vendor").size} vendors.`.slice(0, 300),
    body, ld: itemListLd(`${domain} certifications`, path, items), modified: latest,
  });
}

function certPage(c) {
  const unlocks = certs.filter(o => o.prerequisites.includes(c.id)).sort(byName);
  const prereqs = c.prerequisites.map(id => byId.get(id)).filter(Boolean);
  const related = certs
    .filter(o => o.id !== c.id && o.domain === c.domain)
    .sort((a, b) => (a.level === c.level ? -1 : 0) - (b.level === c.level ? -1 : 0) || byName(a, b))
    .slice(0, 12);
  const price = money(c.price_usd);
  const length = duration(c.duration_min);
  const renewal = c.validity_years ? `Every ${c.validity_years} ${c.validity_years === 1 ? "year" : "years"}` : "Does not expire";

  const facts = [
    ["Vendor", `<a href="${vendorFile(c.vendor)}">${esc(c.vendor)} certifications</a>`],
    ["Domain", `<a href="${domainFile(c.domain)}">${esc(c.domain)}</a>`],
    ["Level", LEVEL_LABEL[c.level]],
    ["Exam price", esc(price) + (c.currency_note ? ` <small>${esc(c.currency_note)}</small>` : "")],
    c.price_verified_at ? ["Price checked", `<time datetime="${c.price_verified_at}">${c.price_verified_at}</time>`] : null,
    c.exam_count > 1 ? ["Exams required", String(c.exam_count)] : null,
    length ? ["Exam length", length] : null,
    ["Exam format", c.hands_on ? "Hands-on, performance-based" : "Written or multiple choice"],
    ["Renewal", renewal + (Number.isFinite(c.renewal_cost) ? ` <small>$${c.renewal_cost.toLocaleString("en-US")}</small>` : "")],
    ["DoD 8140", c.dod_8140 ? "Approved" : "Not listed"],
    ["Prerequisites", prereqs.length ? prereqs.map(certLink).join(", ") : "None"],
    unlocks.length ? ["Leads to", unlocks.map(certLink).join(", ")] : null,
    c.restricted_to ? ["Restricted to", esc(c.restricted_to)] : null,
  ].filter(Boolean);

  const summary = [
    `${c.acronym} is ${/^[aeiou]/i.test(LEVEL_LABEL[c.level]) ? "an" : "a"} ${c.level}-level ${c.domain} certification from ${c.vendor}.`,
    c.price_usd == null ? "The vendor does not publish a standalone exam price." : c.price_usd === 0 ? "It is free." : `The exam costs ${price}.`,
    length ? `The exam runs for ${length}.` : "",
    c.validity_years ? `It renews every ${c.validity_years} ${c.validity_years === 1 ? "year" : "years"}.` : "It does not expire.",
  ].filter(Boolean).join(" ");

  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / <a href="./">Certifications</a> / <a href="${domainFile(c.domain)}">${esc(c.domain)}</a></nav>
<article>
  <h1>${esc(c.name)} <span class="acro">${esc(c.acronym)}</span></h1>
  <p class="lead">${esc(c.description)}</p>
  <p>${esc(summary)}</p>
  <p class="cta"><a class="btn primary" href="../#/cert/${c.id}">Open ${esc(c.acronym)} in the interactive roadmap</a> <a class="btn" href="${esc(c.url)}" rel="noopener noreferrer">Official ${esc(c.vendor)} page</a></p>
  <h2>${esc(c.acronym)} cost, exam and renewal</h2>
  <dl class="facts">
${facts.map(([k, v]) => `    <div><dt>${k}</dt><dd>${v}</dd></div>`).join("\n")}
  </dl>
${c.tags.length ? `  <p class="tags">${c.tags.map(t => `<span>${esc(t)}</span>`).join(" ")}</p>\n` : ""}${related.length ? `  <h2>Other ${esc(c.domain)} certifications</h2>
  <ul class="related">
${related.map(o => `    <li>${certLink(o)} <span>${esc(o.vendor)}, ${LEVEL_LABEL[o.level]}, ${esc(money(o.price_usd))}</span></li>`).join("\n")}
  </ul>\n` : ""}</article>`;

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "EducationalOccupationalCredential",
      name: c.name,
      alternateName: c.acronym,
      description: c.description,
      url: SITE + `certs/${c.id}.html`,
      sameAs: c.url,
      credentialCategory: "certification",
      educationalLevel: LEVEL_LABEL[c.level],
      competencyRequired: c.domain,
      recognizedBy: { "@type": "Organization", name: c.vendor },
      ...(c.validity_years ? { validFor: `P${c.validity_years}Y` } : {}),
      ...(c.price_usd != null ? { offers: { "@type": "Offer", price: String(c.price_usd), priceCurrency: "USD", url: c.url } } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "cert/map", item: SITE },
        { "@type": "ListItem", position: 2, name: "Certifications", item: SITE + "certs/" },
        { "@type": "ListItem", position: 3, name: c.acronym, item: SITE + `certs/${c.id}.html` },
      ],
    },
  ];

  const priceBit = c.price_usd == null ? "" : c.price_usd === 0 ? " Free." : ` Exam price ${price}.`;
  return page({
    path: `certs/${c.id}.html`,
    title: `${c.acronym} certification cost (${year(c.price_verified_at)}), prerequisites and renewal | cert/map`,
    description: `${c.name} (${c.acronym}) by ${c.vendor}: ${c.level}-level ${c.domain} certification.${priceBit} Exam format, renewal cycle, prerequisites and where it sits on the roadmap.`.slice(0, 300),
    body,
    ld,
    modified: c.price_verified_at,
  });
}

function hubPage() {
  const sections = DOMAINS.map(domain => {
    const items = certs.filter(c => c.domain === domain)
      .sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || byName(a, b));
    if (!items.length) return "";
    return `<section id="${slug(domain)}">
  <h2><a href="${domainFile(domain)}">${esc(domain)} certifications</a> <small>${items.length}</small></h2>
  <table>
    <thead><tr><th>Certification</th><th>Vendor</th><th>Level</th><th>Exam price</th></tr></thead>
    <tbody>
${items.map(c => `      <tr><td>${certLink(c)} <span>${esc(c.name)}</span></td><td>${esc(c.vendor)}</td><td>${LEVEL_LABEL[c.level]}</td><td>${esc(money(c.price_usd))}</td></tr>`).join("\n")}
    </tbody>
  </table>
</section>`;
  }).join("\n");

  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / Certifications</nav>
<h1>Cybersecurity certifications list: ${certs.length} certs with prices</h1>
<p class="lead">Every certification on the cert/map security certification roadmap, grouped by domain and ordered from beginner to expert, with the vendor and the current exam price in USD. ${vendors.size} vendors are covered, from CompTIA, ISC2, ISACA, GIAC and OffSec to cloud, forensics and hands-on lab providers.</p>
<p class="cta"><a class="btn primary" href="../">Open the interactive roadmap</a> <a class="btn" href="../data/certs.csv">Download the dataset (CSV)</a></p>
<nav class="toc" aria-label="Domains">${DOMAINS.map(d => `<a href="#${slug(d)}">${esc(d)}</a>`).join(" ")}</nav>
${sections}
<h2>Certifications by vendor</h2>
<nav class="toc" aria-label="Vendors">${[...vendors].sort((a, b) => a.localeCompare(b)).map(v => `<a href="${vendorFile(v)}">${esc(v)}</a>`).join(" ")}</nav>`;

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Cybersecurity certifications list",
      url: SITE + "certs/",
      isPartOf: { "@type": "WebSite", name: "cert/map", url: SITE },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: certs.length,
        itemListElement: certs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: `${c.acronym}: ${c.name}`, url: SITE + `certs/${c.id}.html` })),
      },
    },
  ];

  return page({
    path: "certs/",
    title: `Cybersecurity certifications list: ${certs.length} certs with prices | cert/map`,
    description: `All ${certs.length} cybersecurity certifications on the cert/map roadmap, grouped by domain and level, with vendor and current exam price. Covers ${vendors.size} vendors including CompTIA, ISC2, ISACA, GIAC and OffSec.`,
    body,
    ld,
    modified: latest,
  });
}

function sitemap() {
  const url = (loc, lastmod, priority) =>
    `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[
    url(SITE, latest, "1.0"),
    url(SITE + "certs/", latest, "0.9"),
    ...DOMAINS.map(d => url(SITE + `certs/${domainFile(d)}`, latest, "0.8")),
    ...[...vendors].map(v => url(SITE + `certs/${vendorFile(v)}`, latest, "0.8")),
    ...certs.map(c => url(SITE + `certs/${c.id}.html`, c.price_verified_at || latest, "0.7")),
  ].join("\n")}
</urlset>
`;
}

// Plain-text section at the bottom of the app page. It gives a crawler that
// does not run the app something to read and a link to every domain and vendor
// page; for a person it doubles as a site index.
function aboutSection() {
  const perDomain = count(certs, "domain"), perVendor = count(certs, "vendor");
  const links = (names, file, n) => names.map(x => `<li><a href="certs/${file(x)}">${esc(x)}</a> <span>${n.get(x) || 0}</span></li>`).join("");
  return `        <section class="about" id="about" aria-labelledby="about-title">
          <h2 id="about-title">About this cybersecurity certification roadmap</h2>
          <p>cert/map charts ${certs.length} cybersecurity certifications from ${vendors.size} vendors across ${DOMAINS.length} domains and four seniority levels, from entry-level credentials such as CompTIA Security+ to expert ones such as OSCE3 and CISSP. Each entry lists the current exam price in USD, exam length and format, renewal cycle and prerequisites, checked against the vendor's own page. Pick the certifications you are aiming for to get a path ordered by prerequisite with its total cost and study time, then share it with a link.</p>
          <p><a href="certs/">See every certification as a plain list with prices</a> or <a href="data/certs.csv">download the dataset</a>.</p>
          <h3>Certifications by domain</h3>
          <ul class="about-links">${links(DOMAINS, domainFile, perDomain)}</ul>
          <h3>Certifications by vendor</h3>
          <ul class="about-links">${links([...vendors].sort((a, b) => a.localeCompare(b)), vendorFile, perVendor)}</ul>
        </section>`;
}

// Keep the quoted totals honest wherever a hand-written file mentions them.
function refreshCounts(file) {
  const path = join(ROOT, file);
  const before = readFileSync(path, "utf8");
  const after = before
    .replace(/\b\d+ cybersecurity certifications\b/g, `${certs.length} cybersecurity certifications`)
    .replace(/\b\d+ vendors\b/g, `${vendors.size} vendors`)
    .replace(/\bcompare \d+ certs\b/g, `compare ${certs.length} certs`)
    .replace(/(<!-- build:about -->)[\s\S]*?(<!-- \/build:about -->)/, `$1\n${aboutSection()}\n        $2`)
    .replace(/("dateModified":")\d{4}-\d{2}-\d{2}"/, `$1${latest}"`)
    // The page's CSP pins the inline JSON-LD block by hash, so the hash has to
    // follow any change to the block.
    .replace(/'sha256-[A-Za-z0-9+/=]+'/, (old, _o, text) => {
      const block = text.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      return block ? `'sha256-${createHash("sha256").update(block[1]).digest("base64")}'` : old;
    });
  if (after !== before) writeFileSync(path, after);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const c of certs) writeFileSync(join(OUT, `${c.id}.html`), certPage(c));
for (const v of vendors) writeFileSync(join(OUT, vendorFile(v)), vendorPage(v));
for (const d of DOMAINS) writeFileSync(join(OUT, domainFile(d)), domainPage(d));
writeFileSync(join(OUT, "index.html"), hubPage());
writeFileSync(join(ROOT, "sitemap.xml"), sitemap());
refreshCounts("index.html");
refreshCounts("llms.txt");
console.log(`OK: ${certs.length} certification pages, ${vendors.size} vendor pages, ${DOMAINS.length} domain pages, 1 index and sitemap.xml.`);
