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
//   certs/list-*.html    curated lists (beginner, free, hands-on, DoD 8140, ...)
//   about/index.html     what the site is, a site index and an FAQ
//   llms-full.txt        every certification as Markdown, for language models
//   data/certs.json      the dataset as JSON
//   sitemap.xml          the home page plus all of the above
//
// It also stamps a content hash on every stylesheet and module URL.
//
// It also refreshes the certification count wherever index.html and llms.txt
// quote it. No dependencies; run with `npm run build` after changing the CSV and
// commit the result: the site is published straight from the branch, and CI
// fails if the generated files are stale.

import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
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
  <nav><a href="../certs/">All certifications</a><a href="../about/">About</a><a href="../">Interactive roadmap</a></nav>
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

if (certs.some(c => /^(vendor|domain|list)-/.test(c.id))) throw new Error("a cert id collides with the vendor-/domain-/list- page names");

// Curated cuts of the dataset that match what people actually search for.
// `app` is the query string that opens the same filter in the interactive app.
const byWeight = (a, b) => b.weight - a.weight || byName(a, b);
const byPrice = (a, b) => (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity) || byName(a, b);
const levelList = (level, blurb) => ({
  slug: level,
  name: `${LEVEL_LABEL[level]} cybersecurity certifications`,
  lead: blurb,
  app: `?level=${level}`,
  test: c => c.level === level,
  sort: byWeight,
});
const LISTS = [
  levelList("beginner", "Entry-level certifications for people starting out in security: no earlier credential is assumed, and most can be prepared in a few weeks of study."),
  levelList("intermediate", "Certifications for practitioners with one to three years of experience who are moving into a specialism such as penetration testing, cloud security or incident response."),
  levelList("advanced", "Specialist certifications that assume several years in the field and test depth in a single discipline."),
  levelList("expert", "Capstone credentials: multi-day practical exams and senior management certifications that sit at the top of each path."),
  {
    slug: "free", name: "Free cybersecurity certifications",
    lead: "Certifications whose exam costs nothing. Useful as a first credential or as a way to test a new area before paying for a larger exam.",
    app: "?free=1", test: c => c.price_usd === 0, sort: byLevelThenName,
  },
  {
    slug: "under-300", name: "Cybersecurity certifications under $300",
    lead: "Every certification with a published exam price below 300 US dollars, cheapest first.",
    app: "?pmax=299", test: c => c.price_usd != null && c.price_usd > 0 && c.price_usd < 300, sort: byPrice,
  },
  {
    slug: "hands-on", name: "Hands-on cybersecurity certifications with practical exams",
    lead: "Certifications assessed in a lab or on live systems rather than by multiple choice: you compromise, defend, investigate or build something and are graded on the result.",
    app: "?handson=1", test: c => c.hands_on, sort: byLevelThenName,
  },
  {
    slug: "dod-8140", name: "DoD 8140 approved cybersecurity certifications",
    lead: "Certifications recognised under the US Department of Defense 8140 cyber workforce framework, the successor to DoD 8570.",
    app: "?dod=1", test: c => c.dod_8140, sort: byLevelThenName,
  },
];
const listFile = l => `list-${l.slug}.html`;
const listItems = l => certs.filter(l.test).sort(l.sort);

function listPage(l) {
  const items = listItems(l);
  const path = `certs/${listFile(l)}`;
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / <a href="./">Certifications</a> / ${esc(l.name)}</nav>
<h1>${esc(l.name)}</h1>
<p class="lead">${esc(l.lead)}</p>
<p>${items.length} certifications from ${count(items, "vendor").size} vendors match.${esc(priceRange(items))}</p>
<p class="cta"><a class="btn primary" href="../${l.app}">Open this list in the interactive roadmap</a></p>
${certTable(items, { showDomain: true })}
<h2>More lists</h2>
<nav class="toc">${LISTS.filter(o => o !== l).map(o => `<a href="${listFile(o)}">${esc(o.name)}</a>`).join(" ")}</nav>`;
  return page({
    path, title: `${l.name}: ${items.length} compared with prices (${year()}) | cert/map`,
    description: `${l.lead} ${items.length} certifications including ${items.slice(0, 5).map(c => c.acronym).join(", ")}.${priceRange(items)}`.slice(0, 300),
    body, ld: itemListLd(l.name, path, items), modified: latest,
  });
}

// Questions and answers for the About page, computed from the data so they
// cannot drift from it.
function faq() {
  const names = list => list.map(c => `${c.acronym} (${money(c.price_usd)})`).join(", ");
  const priced = certs.filter(c => c.price_usd > 0);
  const starters = listItems(LISTS[0]).slice(0, 5);
  const free = certs.filter(c => c.price_usd === 0).sort(byLevelThenName);
  const dearest = [...priced].sort((a, b) => b.price_usd - a.price_usd).slice(0, 3);
  const cheapest = [...priced].sort(byPrice).slice(0, 3);
  const verified = certs.filter(c => c.price_verified_at).length;
  return [
    ["What is a cybersecurity certification roadmap?",
      `A roadmap lays certifications out by subject and by seniority so you can see which ones lead to which. cert/map places ${certs.length} certifications from ${vendors.size} vendors on a grid of ${DOMAINS.length} domains and four levels, from beginner to expert, and shows the price, exam format and prerequisites of each.`],
    ["Which cybersecurity certification should a beginner start with?",
      `The most widely recognised entry-level certifications on the roadmap are ${names(starters)}. Which one fits depends on the direction you want to take: general security, networking, cloud or hands-on testing.`],
    ["How much do cybersecurity certifications cost?",
      `Exam prices on the roadmap run from free to ${money(dearest[0].price_usd)}. The cheapest paid exams are ${names(cheapest)}, and the most expensive are ${names(dearest)}. Prices are list prices in US dollars for the exam, without training unless the vendor only sells them together.`],
    ["Are there free cybersecurity certifications?",
      free.length ? `Yes. ${free.map(c => c.acronym).join(", ")} ${free.length === 1 ? "has" : "have"} no exam fee.` : "None of the certifications currently on the roadmap is free."],
    ["Which certifications have a hands-on exam?",
      `${certs.filter(c => c.hands_on).length} of the ${certs.length} certifications are assessed with a practical exam in a lab rather than multiple choice, among them ${listItems(LISTS[6]).filter(c => c.weight > 0).slice(0, 6).map(c => c.acronym).join(", ")}.`],
    ["Which certifications count for DoD 8140?",
      `${certs.filter(c => c.dod_8140).length} certifications on the roadmap are recognised under the US Department of Defense 8140 framework, including ${listItems(LISTS[7]).slice(0, 6).map(c => c.acronym).join(", ")}.`],
    ["How current are the prices?",
      `${verified} of ${certs.length} prices carry the date they were last checked against the vendor's own page; the most recent check was on ${latest}. Each certification page shows its own date. Vendors change prices without notice, so confirm before paying.`],
    ["Can I build and share my own certification path?",
      "Yes. Select certifications in the interactive roadmap and it orders them by prerequisite and adds up exam cost and study time. Give the path a name and copy its link: anyone who opens it sees the same roadmap."],
  ];
}

function aboutPage() {
  const perDomain = count(certs, "domain"), perVendor = count(certs, "vendor");
  const qa = faq();
  const verified = certs.filter(c => c.price_verified_at).length;
  const biggest = Math.max(...perDomain.values());
  const short = l => l.name.replace(/ ?cybersecurity certifications ?/i, " ").replace(/^ with /, "").trim().replace(/^./, ch => ch.toUpperCase());
  const stat = (n, label) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`;
  const mark = `<svg class="mark" viewBox="0 0 32 32" width="56" height="56" aria-hidden="true"><rect class="mark-bg" x="1" y="1" width="30" height="30" rx="8"/><g class="mark-grid"><circle cx="9" cy="9" r="1.5"/><circle cx="16" cy="9" r="1.5"/><circle cx="9" cy="16" r="1.5"/><circle cx="23" cy="16" r="1.5"/><circle cx="16" cy="23" r="1.5"/><circle cx="23" cy="23" r="1.5"/></g><path class="mark-path" d="M9 23H16V16H23V9"/><circle class="mark-node" cx="9" cy="23" r="2.2"/><circle class="mark-node" cx="16" cy="16" r="1.8"/><circle class="mark-node" cx="23" cy="9" r="3"/></svg>`;
  const body = `<section class="hero">
  ${mark}
  <p class="kicker">About</p>
  <h1>The cybersecurity certification roadmap</h1>
  <p class="lead">cert/map charts every certification worth knowing in security by subject and by seniority, with what each one costs, how it is examined and what it leads to.</p>
  <p class="cta"><a class="btn primary" href="../">Open the interactive roadmap</a> <a class="btn" href="../certs/">Browse the full list</a></p>
  <div class="stats">${stat(certs.length, "certifications")}${stat(vendors.size, "vendors")}${stat(DOMAINS.length, "domains")}${stat(verified, "prices verified")}</div>
</section>

<section class="block">
  <h2>What it is</h2>
  <div class="prose two">
    <p>The roadmap places ${certs.length} certifications from ${vendors.size} vendors on a grid of ${DOMAINS.length} domains and four seniority levels, from entry-level credentials such as CompTIA Security+ to expert ones such as OSCE3 and CISSP. Each entry lists the current exam price in US dollars, the length and format of the exam, the renewal cycle and the prerequisites, checked against the vendor's own page.</p>
    <p>Pick the certifications you are aiming for and the site orders them by prerequisite, adds up the exam cost and the study time, and gives you a link to share the result. The project is open source, the dataset is free to reuse and corrections are welcome.</p>
  </div>
</section>

<section class="block">
  <h2>How to use it</h2>
  <ol class="steps">
    <li><strong>Explore</strong><span>Scan the matrix by domain and level, or filter by vendor, price, exam format and DoD 8140 status.</span></li>
    <li><strong>Select</strong><span>Add the certifications you want. Prerequisites can be pulled in with one click.</span></li>
    <li><strong>Plan</strong><span>See the path in order, with the total exam cost and an estimate of the study time.</span></li>
    <li><strong>Share</strong><span>Name the roadmap and copy its link. Anyone who opens it sees the same path.</span></li>
  </ol>
</section>

<section class="block">
  <h2>Popular lists</h2>
  <div class="tiles">
${LISTS.map(l => `    <a class="tile" href="../certs/${listFile(l)}"><strong>${listItems(l).length}</strong><span>${esc(short(l))}</span></a>`).join("\n")}
  </div>
</section>

<section class="block">
  <h2>Certifications by domain</h2>
  <ul class="bars">
${DOMAINS.map(d => `    <li><a href="../certs/${domainFile(d)}">${esc(d)}</a><span class="bar"><i data-w="${Math.max(1, Math.round((perDomain.get(d) || 0) / biggest * 20))}"></i></span><b>${perDomain.get(d) || 0}</b></li>`).join("\n")}
  </ul>
</section>

<section class="block">
  <h2>Certifications by vendor</h2>
  <ul class="columns">
${[...vendors].sort((a, b) => a.localeCompare(b)).map(v => `    <li><a href="../certs/${vendorFile(v)}">${esc(v)}</a><b>${perVendor.get(v)}</b></li>`).join("\n")}
  </ul>
</section>

<section class="block">
  <h2>Questions and answers</h2>
  <div class="faq">
${qa.map(([q, a], i) => `    <details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
  </div>
</section>

<section class="block">
  <h2>Data and licence</h2>
  <div class="prose two">
    <p>The whole dataset is one CSV file, also published as <a href="../data/certs.json">JSON</a>, with a plain-text digest for language models at <a href="../llms.txt">llms.txt</a> and <a href="../llms-full.txt">llms-full.txt</a>. The code is MIT licensed and the dataset is CC BY 4.0. Corrections are welcome on <a href="https://github.com/securitycerts/certmap">GitHub</a>.</p>
    <p>The matrix layout is inspired by Paul Jerimy's Security Certification Roadmap. cert/map is independent and is not affiliated with any of the listed vendors. All trademarks belong to their owners.</p>
  </div>
</section>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "AboutPage", name: "About cert/map", url: SITE + "about/", isPartOf: { "@type": "WebSite", name: "cert/map", url: SITE } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  return page({
    path: "about/",
    title: `About cert/map: cybersecurity certification roadmap, ${certs.length} certs explained`,
    description: `What cert/map is and how to use it: ${certs.length} cybersecurity certifications from ${vendors.size} vendors by domain and level, with answers on cost, beginner options, free and hands-on certifications and DoD 8140.`,
    body, ld, modified: latest,
  });
}

// ---------- machine-readable outputs ----------
function llmsFull() {
  const line = (k, v) => (v ? `- ${k}: ${v}\n` : "");
  let out = `# cert/map: full certification list\n\n> ${certs.length} cybersecurity certifications from ${vendors.size} vendors, grouped by domain and ordered from beginner to expert. Prices are exam list prices in USD. Generated from data/certs.csv; last price check ${latest}.\n\nSource: ${SITE}\nDataset: ${SITE}data/certs.csv and ${SITE}data/certs.json\nLicence: CC BY 4.0 (dataset), MIT (code)\n`;
  for (const domain of DOMAINS) {
    const items = certs.filter(c => c.domain === domain).sort(byLevelThenName);
    if (!items.length) continue;
    out += `\n## ${domain}\n`;
    for (const c of items) {
      out += `\n### ${c.acronym}: ${c.name}\n\n${c.description}\n\n`
        + line("Vendor", c.vendor) + line("Level", c.level)
        + line("Exam price", money(c.price_usd) + (c.currency_note ? ` (${c.currency_note})` : ""))
        + line("Price checked", c.price_verified_at) + line("Exam length", duration(c.duration_min))
        + line("Exam format", c.hands_on ? "hands-on, performance-based" : "written or multiple choice")
        + line("Renewal", c.validity_years ? `every ${c.validity_years} years` : "does not expire")
        + line("Prerequisites", c.prerequisites.map(id => byId.get(id)?.acronym || id).join(", "))
        + line("DoD 8140", c.dod_8140 ? "approved" : "") + line("Restricted to", c.restricted_to)
        + line("Official page", c.url) + line("cert/map page", SITE + `certs/${c.id}.html`);
    }
  }
  return out;
}

function refreshLlms() {
  const path = join(ROOT, "llms.txt");
  const before = readFileSync(path, "utf8");
  const block = `## Vendors covered

${[...vendors].sort((a, b) => a.localeCompare(b)).join(", ")}.

## Pages

- [Interactive roadmap](${SITE}): the matrix of every certification by domain and level
- [About and FAQ](${SITE}about/): what the roadmap is, with answers on cost, beginner options and exam formats
- [All certifications](${SITE}certs/): every certification with vendor, level and price
- [Full text digest](${SITE}llms-full.txt): every certification with all of its fields, in Markdown
- [Dataset as JSON](${SITE}data/certs.json) and [as CSV](${SITE}data/certs.csv)
${LISTS.map(l => `- [${l.name}](${SITE}certs/${listFile(l)}): ${listItems(l).length} certifications`).join("\n")}
${DOMAINS.map(d => `- [${d} certifications](${SITE}certs/${domainFile(d)})`).join("\n")}

Each certification has its own page at \`${SITE}certs/<id>.html\` and each vendor at \`${SITE}certs/vendor-<name>.html\`.

`;
  const after = before.replace(/## Vendors covered[\s\S]*?(?=## Domain taxonomy)/, block);
  if (after !== before) writeFileSync(path, after);
}

// ---------- asset versioning ----------
// Pages caches every file for ten minutes, so right after a deploy a browser can
// pair the new HTML with an old stylesheet or module and render a broken page.
// Every reference to a stylesheet or module carries ?v=<hash of all of them>, so
// a change to any of them changes every URL at once.
function stampAssets() {
  const strip = t => t.replace(/(\.(?:js|css))\?v=[0-9a-f]{8}/g, "$1");
  const jsDir = join(ROOT, "assets", "js");
  const modules = readdirSync(jsDir).filter(f => f.endsWith(".js")).sort().map(f => join(jsDir, f));
  const hash = createHash("sha256");
  for (const f of [...modules, join(ROOT, "assets", "css", "styles.css"), join(ROOT, "assets", "vendor", "anime.esm.min.js")]) {
    hash.update(strip(readFileSync(f, "utf8")));
  }
  const v = hash.digest("hex").slice(0, 8);
  for (const f of modules) {
    const before = readFileSync(f, "utf8");
    const after = strip(before).replace(/(from\s+"\.{1,2}\/[^"]+\.js)"/g, `$1?v=${v}"`);
    if (after !== before) writeFileSync(f, after);
  }
  const index = join(ROOT, "index.html");
  const before = readFileSync(index, "utf8");
  const after = strip(before).replace(/("assets\/(?:js|css|vendor)\/[^"?]+\.(?:js|css))"/g, `$1?v=${v}"`);
  if (after !== before) writeFileSync(index, after);
  return v;
}

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
    ["Level", `<a href="list-${c.level}.html">${LEVEL_LABEL[c.level]}</a>`],
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
<h2>Popular lists</h2>
<nav class="toc" aria-label="Lists">${LISTS.map(l => `<a href="${listFile(l)}">${esc(l.name)}</a>`).join(" ")}</nav>
<h2>By domain</h2>
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
    url(SITE + "about/", latest, "0.8"),
    ...LISTS.map(l => url(SITE + `certs/${listFile(l)}`, latest, "0.8")),
    ...DOMAINS.map(d => url(SITE + `certs/${domainFile(d)}`, latest, "0.8")),
    ...[...vendors].map(v => url(SITE + `certs/${vendorFile(v)}`, latest, "0.8")),
    ...certs.map(c => url(SITE + `certs/${c.id}.html`, c.price_verified_at || latest, "0.7")),
  ].join("\n")}
</urlset>
`;
}

// Keep the quoted totals honest wherever a hand-written file mentions them.
function refreshCounts(file) {
  const path = join(ROOT, file);
  const before = readFileSync(path, "utf8");
  const after = before
    .replace(/\b\d+ cybersecurity certifications\b/g, `${certs.length} cybersecurity certifications`)
    .replace(/\b\d+ vendors\b/g, `${vendors.size} vendors`)
    .replace(/\bcompare \d+ certs\b/g, `compare ${certs.length} certs`)
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
for (const l of LISTS) writeFileSync(join(OUT, listFile(l)), listPage(l));
writeFileSync(join(OUT, "index.html"), hubPage());
mkdirSync(join(ROOT, "about"), { recursive: true });
writeFileSync(join(ROOT, "about", "index.html"), aboutPage());
writeFileSync(join(ROOT, "llms-full.txt"), llmsFull());
writeFileSync(join(ROOT, "data", "certs.json"), "[\n" + certs.map(c => JSON.stringify(c)).join(",\n") + "\n]\n");
refreshLlms();
const version = stampAssets();
writeFileSync(join(ROOT, "sitemap.xml"), sitemap());
refreshCounts("index.html");
refreshCounts("llms.txt");
console.log(`OK: ${certs.length} certification, ${vendors.size} vendor, ${DOMAINS.length} domain and ${LISTS.length} list pages, about/, llms-full.txt, certs.json, sitemap.xml. Assets v=${version}.`);
