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
//   certs/plan-<id>.html  the ordered study plan of each certification that has resources
//   certs/compare-*.html side-by-side comparisons of the pairs in data/comparisons.csv,
//                        repeated in es/ fr/ de/ it/ ar/ ko/ he/ with hreflang links
//   index.html           the home page: what the site is, a site index, an FAQ and the sponsors
//   sponsors/index.html  what sponsoring involves, the tiers and an FAQ
//   about/index.html     redirect to the home page, its former address
//   r/index.html         landing page that shared roadmap links point at
//   llms-full.txt        every certification as Markdown, for language models
//   data/certs.json      the dataset as JSON
//   api/v1/*.json        the same data as a static JSON API, plus api/openapi.json and api/index.html
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
import { existsSync } from "node:fs";
import { parseCSV, rowsToCerts, DOMAINS, tableFromCSV, groupResources, groupComparisons, compareFile, studyPlan } from "../assets/js/data.js";
import { ROLE_PATHS, orderByPrerequisite, pathTotals } from "../assets/js/paths.js";
import { LANGS, LANG_ORDER } from "./compare-i18n.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://certmap.dev/";
const OUT = join(ROOT, "certs");
const EMAIL = "contact@certmap.dev";
// Content hashes for the files the generated pages load. Pages caches every
// file for ten minutes, so without these a browser can show new HTML with the
// previous stylesheet, which renders as unstyled text.
const fileHash = rel => createHash("sha256").update(readFileSync(join(ROOT, rel))).digest("hex").slice(0, 8);
const STATIC_V = fileHash("assets/css/static.css");
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
const table = file => tableFromCSV(readFileSync(join(ROOT, "data", file), "utf8"));
const RESOURCES = groupResources(table("resources.csv"), byId);
const PAIR_ROWS = table("comparisons.csv").filter(r => byId.has(r.a) && byId.has(r.b) && r.a !== r.b);
const VERSUS = groupComparisons(PAIR_ROWS, byId);
const PAIRS = [...new Map(PAIR_ROWS.map(r => [[r.a, r.b].sort().join("|"), r])).values()];

function page({ path, title, description, body, ld, modified, image = "assets/og.png", root = false, script = "", T = LANGS.en, alternates = [] }) {
  const canonical = SITE + path;
  const html = `<!doctype html>
<html lang="${T.code}"${T.dir === "rtl" ? ' dir="rtl"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${alternates.map(x => `<link rel="alternate" hreflang="${x.lang}" href="${x.href}">`).join("\n")}
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="cert/map">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:image" content="${SITE}${image}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src ${script ? "'self'" : "'none'"}; style-src 'self'; img-src 'self'; base-uri 'self'; form-action 'none'; object-src 'none'">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0b0d12">
<link rel="icon" type="image/svg+xml" href="../favicon/favicon.svg">
<link rel="icon" type="image/x-icon" href="../favicon/favicon.ico">
<link rel="stylesheet" href="../assets/css/static.css?v=${STATIC_V}">
<script type="application/ld+json">${jsonLd(ld)}</script>
</head>
<body>
<header class="top">
  <a class="brand" href="../">cert<span>/</span>map</a>
  <nav><a href="../certs/">${T.nav[0]}</a><a href="../api/">API</a><a href="../sponsors/">${T.nav[1]}</a><a href="../map/">${T.nav[2]}</a></nav>
</header>
<main>
${body}
</main>
<footer>
  <p>${T.code === "en"
    ? `Part of <a href="../">cert/map</a>, an open-source roadmap of cybersecurity certifications. Prices are list prices in USD and can change, so confirm with the vendor before paying.${modified ? ` Last reviewed ${modified}.` : ""}`
    : `${esc(T.footer)}${modified ? ` <time datetime="${modified}">${modified}</time>` : ""}`}</p>
  <p><a href="https://github.com/securitycerts/certmap">Source and dataset on GitHub</a> · <a href="../api/">API</a> · <a href="../sponsors/">Become a sponsor</a> · <a href="mailto:${EMAIL}">${EMAIL}</a></p>
</footer>
${script ? `<script src="../${script}?v=${fileHash(script)}"></script>\n` : ""}</body>
</html>
`;
  // Pages are written as if they sat one level down. The home page sits at the
  // root, so its links to the rest of the site lose the leading "../".
  return root ? html.replaceAll('="../"', '="./"').replaceAll('="../', '="') : html;
}

const certLink = c => `<a href="${c.id}.html">${esc(c.acronym)}</a>`;
const vendorFile = v => `vendor-${slug(v)}.html`;
const domainFile = d => `domain-${slug(d)}.html`;
const year = iso => (iso || latest).slice(0, 4);
const count = (list, key) => list.reduce((m, c) => m.set(c[key], (m.get(c[key]) || 0) + 1), new Map());
const byLevelThenName = (a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level) || byName(a, b);

if (certs.some(c => /^(vendor|domain|list|path|compare|plan)-/.test(c.id))) throw new Error("a cert id collides with the vendor-/domain-/list- page names");

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
<p class="cta"><a class="btn primary" href="../map/${l.app}">Open this list in the interactive roadmap</a></p>
${certTable(items, { showDomain: true })}
<h2>More lists</h2>
<nav class="toc">${LISTS.filter(o => o !== l).map(o => `<a href="${listFile(o)}">${esc(o.name)}</a>`).join(" ")}</nav>`;
  return page({
    path, title: `${l.name}: ${items.length} compared with prices (${year()}) | cert/map`,
    description: `${l.lead} ${items.length} certifications including ${items.slice(0, 5).map(c => c.acronym).join(", ")}.${priceRange(items)}`.slice(0, 300),
    body, ld: itemListLd(l.name, path, items), modified: latest,
  });
}

// ---------- preparation resources ----------
// "How to prepare": links out to study material. Sponsored entries, when there
// are any, sit in their own labelled box above the list and carry
// rel="sponsored", so a paid placement is never read as an editorial pick.
// The study plan as markup. `fold` wraps each phase in a <details>, used where
// the plan is one section among others; the plan's own page shows it in full.
const planFile = c => `plan-${c.id}.html`;
function planPhases(c, T, { fold }) {
  const list = RESOURCES.get(c.id) || [];
  const meta = r => [esc(r.provider), T.resource[r.type], r.official ? T.official : "", r.free ? T.freeTag : ""].filter(Boolean).join(" · ");
  const link = r => `<a href="${esc(r.url)}" rel="${r.sponsored ? "sponsored " : ""}noopener noreferrer">${esc(r.title)}</a>`;
  const sponsored = list.filter(r => r.sponsored);
  const phaseIndex = { know: 0, learn: 1, practice: 2, test: 3 };
  const steps = phase => `<ol class="prep" start="${phase.start}">
${phase.items.map(r => `    <li value="${r.step}">${link(r)} <span>${meta(r)}</span></li>`).join("\n")}
  </ol>`;
  return (sponsored.length ? `  <div class="prep-sponsored"><small>${T.sponsored}</small>\n    <ul class="prep">\n${sponsored.map(r => `      <li>${link(r)} <span>${meta(r)}</span></li>`).join("\n")}\n    </ul>\n  </div>\n` : "")
    + studyPlan(list).map(phase => {
      const name = T.phases[phaseIndex[phase.id]];
      return fold
        ? `  <details class="phase"${phase.items.length <= 4 ? " open" : ""}><summary>${name} <small>${phase.items.length}</small></summary>\n  ${steps(phase)}\n  </details>`
        : `  <h2 class="phase" id="${phase.id}">${name} <small>${phase.items.length}</small></h2>\n  ${steps(phase)}`;
    }).join("\n");
}

function prepHtml(c, T = LANGS.en) {
  if (!(RESOURCES.get(c.id) || []).length) return "";
  const plan = `${T.code === "en" ? "" : "../certs/"}${planFile(c)}`;
  return `  <h2>${esc(T.hPrepare(T.iso(c.acronym)))}</h2>
  <p class="fine">${esc(T.planNote)}</p>
${planPhases(c, T, { fold: true })}
  <p class="cta"><a class="btn" href="${plan}">${esc(T.hPrepare(T.iso(c.acronym)))} →</a></p>
  <p class="fine">${esc(T.resNote)}</p>
`;
}

// One page per study plan: the whole plan unfolded, for someone who searched
// for how to prepare a certification or who wants to keep the plan open while
// working through it.
function planPage(c) {
  const T = LANGS.en;
  const list = RESOURCES.get(c.id) || [];
  const plan = studyPlan(list);
  const free = list.filter(r => r.free && !r.sponsored).length;
  const labs = list.filter(r => ["lab", "repo"].includes(r.type)).length;
  const hours = { beginner: 60, intermediate: 140, advanced: 260, expert: 420 }[c.level];
  const path = `certs/${planFile(c)}`;
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / <a href="./">Certifications</a> / <a href="${c.id}.html">${esc(c.acronym)}</a> / Study plan</nav>
<article>
  <h1>${esc(c.acronym)} study plan</h1>
  <p class="lead">${list.length} resources for ${esc(c.name)}, in the order to use them: what the exam asks for, the material to learn, hands-on practice and a final check.</p>
  <div class="stats">
    <div class="stat"><strong>${list.length}</strong><span>steps</span></div>
    <div class="stat"><strong>${free}</strong><span>free</span></div>
    <div class="stat"><strong>${labs}</strong><span>labs and open source</span></div>
    <div class="stat"><strong>${hours}h</strong><span>study budget at ${c.level} level</span></div>
  </div>
  <p class="cta"><a class="btn primary" href="../map/#/cert/${c.id}">Open ${esc(c.acronym)} in the interactive roadmap</a> <a class="btn" href="${c.id}.html">${esc(c.acronym)} cost, exam and renewal</a></p>
  <nav class="toc">${plan.map(ph => `<a href="#${ph.id}">${T.phases[{ know: 0, learn: 1, practice: 2, test: 3 }[ph.id]]} <small>${ph.items.length}</small></a>`).join(" ")}</nav>
${planPhases(c, T, { fold: false })}
  <p class="fine">${esc(T.resNote)} Each link was opened when it was added. Exam price: ${esc(money(c.price_usd))}.</p>
${versusHtml(c)}</article>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "ItemList", name: `${c.acronym} study plan`, numberOfItems: list.length,
      itemListElement: plan.flatMap(ph => ph.items).map(r => ({ "@type": "ListItem", position: r.step, name: r.title, url: r.url })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "cert/map", item: SITE },
      { "@type": "ListItem", position: 2, name: "Certifications", item: SITE + "certs/" },
      { "@type": "ListItem", position: 3, name: c.acronym, item: SITE + `certs/${c.id}.html` },
      { "@type": "ListItem", position: 4, name: "Study plan", item: SITE + path },
    ] },
  ];
  return page({
    path,
    title: `${c.acronym} study plan: ${list.length} resources in order, ${free} free (${year()}) | cert/map`,
    description: `How to prepare for ${c.acronym} (${c.name}): ${list.length} resources in order, with ${labs} practice labs and open-source projects and ${free} free items. Exam guide, courses, reading, labs and practice questions.`.slice(0, 300),
    body, ld, modified: latest,
  });
}

function versusHtml(c) {
  const list = VERSUS.get(c.id) || [];
  if (!list.length) return "";
  return `  <h2>Compare ${esc(c.acronym)} with</h2>
  <nav class="toc">${list.map(v => `<a href="${v.file}">${esc(c.acronym)} vs ${esc(byId.get(v.id).acronym)}</a>`).join(" ")}</nav>
`;
}

// ---------- comparison pages ----------
// Everything on a comparison page is computed from the two rows of the
// dataset: the table, the list of differences and the answers below it. No
// opinion is added, so a page can never disagree with the data it sits on.
// The wording for each language lives in compare-i18n.mjs.
const prereqClosure = (id, seen = new Set()) => {
  for (const p of byId.get(id)?.prerequisites || []) if (!seen.has(p) && byId.has(p)) { seen.add(p); prereqClosure(p, seen); }
  return seen;
};
const comparePath = (a, b, T) => `${T.code === "en" ? "certs" : T.code}/${compareFile(a.id, b.id)}`;

function compareFacts(a, b, T) {
  const A = T.iso(a.acronym), B = T.iso(b.acronym);
  const name = c => T.iso(c.acronym);
  const priced = c => (c.price_usd === 0 ? T.free : T.money(c.price_usd));
  let price;
  if (a.price_usd != null && b.price_usd != null) {
    if (a.price_usd === b.price_usd) price = T.priceSame(priced(a));
    else {
      const [lo, hi] = a.price_usd < b.price_usd ? [a, b] : [b, a];
      price = T.priceDiff(name(lo), priced(lo), name(hi), priced(hi), T.money(hi.price_usd - lo.price_usd));
    }
  } else if (a.price_usd != null || b.price_usd != null) {
    const [known, unknown] = a.price_usd != null ? [a, b] : [b, a];
    price = T.priceOne(name(known), priced(known), name(unknown));
  } else price = T.priceNone;

  let level;
  if (a.level !== b.level) {
    const [lo, hi] = LEVELS.indexOf(a.level) < LEVELS.indexOf(b.level) ? [a, b] : [b, a];
    level = T.levelDiff(name(lo), T.levels[lo.level], name(hi), T.levels[hi.level]);
  } else level = T.levelSame(T.levels[a.level]);

  const format = a.hands_on !== b.hands_on
    ? T.formatDiff(name(a.hands_on ? a : b), name(a.hands_on ? b : a))
    : T.formatSame(a.hands_on);

  const renewOf = c => (c.validity_years ? T.renews(c.validity_years) : T.never);
  const renew = a.validity_years === b.validity_years
    ? (a.validity_years ? T.renewBoth(a.validity_years) : T.renewNeither)
    : T.renewEach(A, renewOf(a), B, renewOf(b));

  const list = [price, level, format];
  if (a.duration_min && b.duration_min && a.duration_min !== b.duration_min) {
    const [short, long] = a.duration_min < b.duration_min ? [a, b] : [b, a];
    list.push(T.lengthDiff(name(long), T.duration(long.duration_min), name(short), T.duration(short.duration_min)));
  }
  list.push(renew);
  if (a.dod_8140 !== b.dod_8140) list.push(T.dod(name(a.dod_8140 ? a : b), name(a.dod_8140 ? b : a)));
  if (prereqClosure(b.id).has(a.id)) list.push(T.prereq(A, B));
  if (prereqClosure(a.id).has(b.id)) list.push(T.prereq(B, A));
  if (a.vendor === b.vendor) list.push(T.sameVendor(T.iso(a.vendor)));

  const fmt = c => (c.hands_on ? T.handsOn : T.written);
  const qa = [
    [T.q.cheaper(A, B), price],
    [T.q.level(A, B), a.level === b.level ? T.levelAnswerSame(T.levels[a.level]) : T.levelAnswerDiff(A, T.levels[a.level], B, T.levels[b.level])],
    [T.q.expire(A, B), renew],
    [T.q.handsOn(A, B), T.formatEach(A, fmt(a), B, fmt(b))],
  ];
  return { list, qa };
}

function comparePage(a, b, T) {
  const file = compareFile(a.id, b.id);
  const path = comparePath(a, b, T);
  const { list, qa } = compareFacts(a, b, T);
  const certs = T.code === "en" ? "" : "../certs/";      // cert, vendor and domain pages exist in English only
  const link = c => `<a href="${certs}${c.id}.html">${esc(c.acronym)}</a>`;
  const L = T.labels;
  const priced = c => (c.price_usd == null ? T.notPublished : c.price_usd === 0 ? T.free : T.money(c.price_usd));
  const rows = [
    [L.name, c => `<a href="${certs}${c.id}.html">${esc(c.name)}</a>`],
    [L.vendor, c => `<a href="${certs}${vendorFile(c.vendor)}">${esc(c.vendor)}</a>`],
    [L.domain, c => `<a href="${certs}${domainFile(c.domain)}">${esc(c.domain)}</a>`],
    [L.level, c => T.levels[c.level]],
    [L.price, c => esc(priced(c)) + (T.code === "en" && c.currency_note ? `<small>${esc(c.currency_note)}</small>` : "")],
    [L.checked, c => (c.price_verified_at ? `<time datetime="${c.price_verified_at}">${c.price_verified_at}</time>` : T.notVerified)],
    [L.length, c => T.duration(c.duration_min) || T.notStated],
    [L.format, c => (c.hands_on ? T.handsOn : T.written)],
    [L.exams, c => String(c.exam_count)],
    [L.renewal, c => (c.validity_years ? T.every(c.validity_years) : T.noExpiry)],
    [L.dod, c => (c.dod_8140 ? T.approved : T.notListed)],
    [L.prereq, c => c.prerequisites.map(id => byId.get(id)).filter(Boolean).map(link).join(", ") || T.none],
  ];
  const others = [...new Map([...(VERSUS.get(a.id) || []), ...(VERSUS.get(b.id) || [])]
    .filter(v => v.file !== file).map(v => [v.file, v])).values()];
  const label = v => { const [x, y] = v.file.replace(/^compare-|\.html$/g, "").split("-vs-"); return `${byId.get(x).acronym} vs ${byId.get(y).acronym}`; };
  const alternates = [
    ...LANG_ORDER.map(code => ({ lang: code, href: SITE + comparePath(a, b, LANGS[code]) })),
    { lang: "x-default", href: SITE + comparePath(a, b, LANGS.en) },
  ];
  const switcher = `<nav class="langs" aria-label="Language">${LANG_ORDER.map(code => {
    const o = LANGS[code];
    return code === T.code
      ? `<span lang="${code}" aria-current="true">${o.name}</span>`
      : `<a lang="${code}" hreflang="${code}" href="../${comparePath(a, b, o)}">${o.name}</a>`;
  }).join(" ")}</nav>`;
  const A = T.iso(a.acronym), B = T.iso(b.acronym);
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / <a href="../certs/">${T.crumbCerts}</a> / <a href="../certs/#comparisons">${T.crumbCompare}</a></nav>
${switcher}
<article>
  <h1><bdi>${esc(a.acronym)}</bdi> vs <bdi>${esc(b.acronym)}</bdi></h1>
  <p class="orline">${esc(T.orLine(A, B))}</p>
  <p class="lead">${esc(T.lead(T.iso(a.name), T.iso(b.name)))}</p>
  <p class="cta"><a class="btn primary" href="../map/#/roadmap/${a.id},${b.id}?name=${encodeURIComponent(`${a.acronym} vs ${b.acronym}`)}">${T.cta}</a></p>
  <table class="versus">
    <thead><tr><th></th><th>${link(a)}</th><th>${link(b)}</th></tr></thead>
    <tbody>
${rows.map(([k, f]) => `      <tr><th scope="row">${k}</th><td>${f(a)}</td><td>${f(b)}</td></tr>`).join("\n")}
    </tbody>
  </table>
  <h2>${esc(T.diffOf(A, B))}</h2>
  <ul class="diff">
${list.map(d => `    <li>${esc(d)}</li>`).join("\n")}
  </ul>
${T.hCovers ? `  <h2>${T.hCovers}</h2>
  <p><strong>${esc(a.acronym)}.</strong> ${esc(a.description)}</p>
  <p><strong>${esc(b.acronym)}.</strong> ${esc(b.description)}</p>
` : ""}${prepHtml(a, T)}${prepHtml(b, T)}  <h2>${T.hQuestions}</h2>
  <div class="faq">
${qa.map(([q, ans]) => `    <details><summary>${esc(q)}</summary><p>${esc(ans)}</p></details>`).join("\n")}
  </div>
${others.length ? `  <h2>${T.hRelated}</h2>\n  <nav class="toc">${others.map(v => `<a href="${v.file}"><bdi>${esc(label(v))}</bdi></a>`).join(" ")}</nav>\n` : ""}</article>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "FAQPage", inLanguage: T.code, mainEntity: qa.map(([q, ans]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: ans } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "cert/map", item: SITE },
      { "@type": "ListItem", position: 2, name: T.crumbCerts, item: SITE + "certs/" },
      { "@type": "ListItem", position: 3, name: `${a.acronym} vs ${b.acronym}`, item: SITE + path },
    ] },
  ];
  return page({
    path, T, alternates,
    title: `${T.title(a.acronym, b.acronym, year())} | ${T.titleTail(a.acronym, b.acronym)}`,
    description: `${T.orLine(a.acronym, b.acronym)} ${list.slice(0, 2).join(" ")}`.replace(/[⁨⁩]/g, "").slice(0, 300),
    body, ld, modified: [a.price_verified_at, b.price_verified_at].filter(Boolean).sort().pop() || latest,
  });
}

// ---------- role paths ----------
// Each preset path gets a page of its own with its own preview image, so a
// link to "the SOC analyst path" shows that path when it is pasted somewhere.
const pathFile = p => `path-${p.id}.html`;
const pathCerts = p => orderByPrerequisite(p.certs.map(id => byId.get(id)).filter(Boolean));
const pathAppLink = p => `../map/#/roadmap/${pathCerts(p).map(c => c.id).join(",")}?name=${encodeURIComponent(p.name + " path")}`;

function pathPage(p) {
  const items = pathCerts(p);
  const t = pathTotals(items);
  const path = `certs/${pathFile(p)}`;
  const image = `assets/og/path-${p.id}.png`;
  const lower = /^(SOC|DFIR|GRC)\b/.test(p.name) ? p.name : p.name[0].toLowerCase() + p.name.slice(1);
  const cost = "$" + t.cost.toLocaleString("en-US");
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / <a href="./">Certifications</a> / ${esc(p.name)} path</nav>
<h1>${esc(p.name)} certification path</h1>
<p class="lead">A suggested route for a ${esc(lower)}: ${items.length} certifications in the order to take them, about ${t.hours} hours of study and ${cost} in exam fees.</p>
<p>At ten hours of study a week the whole path takes roughly ${t.months} months. Prerequisites come first, then the order follows seniority. Open it in the interactive roadmap to add or drop steps, write notes on each one and share your own version.</p>
<p class="cta"><a class="btn primary" href="${pathAppLink(p)}">Open this path in the interactive roadmap</a></p>
<table>
    <thead><tr><th>Step</th><th>Certification</th><th>Vendor</th><th>Level</th><th>Exam price</th></tr></thead>
    <tbody>
${items.map((c, i) => `      <tr><td>${i + 1}</td><td>${certLink(c)} <span>${esc(c.name)}</span></td><td><a href="${vendorFile(c.vendor)}">${esc(c.vendor)}</a></td><td>${LEVEL_LABEL[c.level]}</td><td>${esc(money(c.price_usd))}</td></tr>`).join("\n")}
    </tbody>
  </table>
<h2>Other certification paths</h2>
<nav class="toc">${ROLE_PATHS.filter(o => o !== p).map(o => `<a href="${pathFile(o)}">${esc(o.name)}</a>`).join(" ")}</nav>`;
  return page({
    path, title: `${p.name} certification path: ${items.length} certs in order, ${cost} (${year()}) | cert/map`,
    description: `${p.name} certification roadmap: ${items.map(c => c.acronym).join(", ")}. About ${t.hours} hours of study and ${cost} in exam fees, with prerequisites and current prices.`.slice(0, 300),
    body, ld: itemListLd(`${p.name} certification path`, path, items), modified: latest,
    image: existsSync(join(ROOT, image)) ? image : undefined,
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
    ["Does cert/map help me study for a certification?",
      `Yes. ${RESOURCES.size} certifications have a study plan: the exam guide first, then courses and reading, then hands-on practice with direct links to free labs and open-source projects, then practice questions. The plans hold ${[...RESOURCES.values()].reduce((k, l) => k + l.length, 0)} links in total, and every link was opened when it was added.`],
    ["Can I build and share my own certification path?",
      "Yes. Select certifications in the interactive roadmap and it orders them by prerequisite and adds up exam cost and study time. Give the path a name and copy its link: anyone who opens it sees the same roadmap."],
  ];
}

function homePage() {
  const perDomain = count(certs, "domain"), perVendor = count(certs, "vendor");
  const qa = faq();
  const verified = certs.filter(c => c.price_verified_at).length;
  const biggest = Math.max(...perDomain.values());
  const short = l => l.name.replace(/ ?cybersecurity certifications ?/i, " ").replace(/^ with /, "").trim().replace(/^./, ch => ch.toUpperCase());
  const stat = (n, label) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`;
  const mark = `<svg class="mark" viewBox="0 0 32 32" width="56" height="56" aria-hidden="true"><rect class="mark-bg" x="1" y="1" width="30" height="30" rx="8"/><g class="mark-grid"><circle cx="9" cy="9" r="1.5"/><circle cx="16" cy="9" r="1.5"/><circle cx="9" cy="16" r="1.5"/><circle cx="23" cy="16" r="1.5"/><circle cx="16" cy="23" r="1.5"/><circle cx="23" cy="23" r="1.5"/></g><path class="mark-path" d="M9 23H16V16H23V9"/><circle class="mark-node" cx="9" cy="23" r="2.2"/><circle class="mark-node" cx="16" cy="16" r="1.8"/><circle class="mark-node" cx="23" cy="9" r="3"/></svg>`;
  const body = `<section class="hero">
  ${mark}
  <p class="kicker">Open source · ${certs.length} certifications</p>
  <h1>The cybersecurity certification roadmap</h1>
  <p class="lead">cert/map charts every certification worth knowing in security by subject and by seniority, with what each one costs and what it leads to, and gives you an ordered study plan to prepare for it.</p>
  <p class="cta"><a class="btn primary big" href="../map/">Open the roadmap</a> <a class="btn big" href="../certs/">Browse the full list</a></p>
  <div class="stats">${stat(certs.length, "certifications")}${stat(vendors.size, "vendors")}${stat(RESOURCES.size, "study plans")}${stat(verified, "prices verified")}</div>
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
  <ol class="steps five">
    <li><strong>Explore</strong><span>Scan the matrix by domain and level, or filter by vendor, price, exam format and DoD 8140 status.</span></li>
    <li><strong>Select</strong><span>Add the certifications you want. Prerequisites can be pulled in with one click.</span></li>
    <li><strong>Plan</strong><span>See the path in order, with the total exam cost and an estimate of the study time.</span></li>
    <li><strong>Study</strong><span>Follow each certification's study plan: exam guide, courses, free labs and practice questions, numbered in order.</span></li>
    <li><strong>Share</strong><span>Name the roadmap and copy its link. Anyone who opens it sees the same path.</span></li>
  </ol>
</section>

${sponsorsSection()}

<section class="block">
  <h2>Popular lists</h2>
  <div class="tiles">
${LISTS.map(l => `    <a class="tile" href="../certs/${listFile(l)}"><strong>${listItems(l).length}</strong><span>${esc(short(l))}</span></a>`).join("\n")}
  </div>
</section>

<section class="block">
  <h2>Study plans</h2>
  <div class="prose"><p>An ordered plan for each of the most sought-after certifications: what to read first, what to practice on and how to check you are ready. Free labs and open-source material are linked directly.</p></div>
  <nav class="toc">${certs.filter(c => RESOURCES.has(c.id)).sort((x, y) => y.weight - x.weight || byName(x, y)).slice(0, 32).map(c => `<a href="../certs/${planFile(c)}">${esc(c.acronym)} <small>${RESOURCES.get(c.id).length}</small></a>`).join(" ")} <a href="../certs/#plans">All ${RESOURCES.size} plans</a></nav>
</section>

${PAIRS.length ? `<section class="block">
  <h2>Popular comparisons</h2>
  <nav class="toc">${PAIRS.slice(0, 24).map(r => `<a href="../certs/${compareFile(r.a, r.b)}">${esc(byId.get(r.a).acronym)} vs ${esc(byId.get(r.b).acronym)}</a>`).join(" ")}</nav>
</section>

` : ""}<section class="block">
  <h2>Career paths</h2>
  <div class="tiles">
${ROLE_PATHS.map(p => `    <a class="tile" href="../certs/${pathFile(p)}"><strong>$${pathTotals(pathCerts(p)).cost.toLocaleString("en-US")}</strong><span>${esc(p.name)}</span></a>`).join("\n")}
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

<section class="block" id="developers">
  <h2>For developers</h2>
  <div class="support">
    <div>
      <strong>A free JSON API, no key needed</strong>
      <span>Every certification with its price, level, prerequisites, study plan and comparisons, as static JSON you can fetch from any site. One file per certification, for example <a href="../api/v1/certs/oscp.json"><code>/api/v1/certs/oscp.json</code></a>.</span>
    </div>
    <a class="btn" href="../api/">API documentation</a>
  </div>
</section>

<section class="block">
  <h2>Data and licence</h2>
  <div class="prose two">
    <p>The whole dataset is one CSV file, also published as <a href="../data/certs.json">JSON</a>, with a plain-text digest for language models at <a href="../llms.txt">llms.txt</a> and <a href="../llms-full.txt">llms-full.txt</a>. The code is MIT licensed and the dataset is CC BY 4.0. Corrections are welcome on <a href="https://github.com/securitycerts/certmap">GitHub</a>.</p>
    <p>The matrix layout is inspired by Paul Jerimy's Security Certification Roadmap. cert/map is independent and is not affiliated with any of the listed vendors. All trademarks belong to their owners.</p>
  </div>
</section>

<section class="block" id="contact">
  <h2>Contact</h2>
  <p class="contact">Questions, corrections or sponsorship: <a href="mailto:${EMAIL}">${EMAIL}</a></p>
</section>`;
  const ld = [
    { "@context": "https://schema.org", "@type": "WebSite", name: "cert/map", alternateName: "Cybersecurity Certification Roadmap", url: SITE, inLanguage: "en" },
    { "@context": "https://schema.org", "@type": "Organization", name: "cert/map", url: SITE, logo: SITE + "favicon/web-app-manifest-512x512.png", email: EMAIL, sameAs: ["https://github.com/securitycerts/certmap"] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  return page({
    path: "",
    title: `Cybersecurity Certification Roadmap and Study Plans: ${certs.length} certs compared | cert/map`,
    description: `cert/map is an open-source cybersecurity certification roadmap and study organiser: ${certs.length} certifications from ${vendors.size} vendors by domain and seniority, with current exam prices, side-by-side comparisons and ordered study plans with free labs. Build a certification path and share it.`,
    body, ld, modified: latest, root: true, script: "assets/js/landing.js",
  });
}

// ---------- static JSON API ----------
// The site has no server, so the API is a set of JSON files written here and
// served like any other page. GitHub Pages sends Access-Control-Allow-Origin: *
// on every file, so another site can fetch them from the browser. Everything is
// under api/v1/ so a breaking change can ship as v2 without moving these.
const API = "api/v1/";
const apiUrl = rel => SITE + API + rel;

function apiCertSummary(c) {
  return {
    id: c.id, acronym: c.acronym, name: c.name, vendor: c.vendor, issuer: c.issuer || null,
    domain: c.domain, level: c.level, price_usd: c.price_usd, hands_on: c.hands_on,
    page: SITE + `certs/${c.id}.html`, api: apiUrl(`certs/${c.id}.json`),
  };
}

function apiCert(c) {
  const list = RESOURCES.get(c.id) || [];
  return {
    ...apiCertSummary(c),
    description: c.description, tags: c.tags,
    currency_note: c.currency_note || null, price_verified_at: c.price_verified_at || null,
    duration_min: c.duration_min, exam_count: c.exam_count,
    validity_years: c.validity_years || 0, renewal_cost: Number.isFinite(c.renewal_cost) ? c.renewal_cost : null,
    dod_8140: c.dod_8140, restricted_to: c.restricted_to || null,
    prerequisites: c.prerequisites,
    leads_to: certs.filter(o => o.prerequisites.includes(c.id)).map(o => o.id),
    official_url: c.url,
    comparisons: (VERSUS.get(c.id) || []).map(v => ({ with: v.id, page: SITE + `certs/${v.file}` })),
    study_plan: list.length ? {
      page: SITE + `certs/${planFile(c)}`,
      phases: studyPlan(list).map(ph => ({
        id: ph.id,
        steps: ph.items.map(r => ({ step: r.step, type: r.type, title: r.title, provider: r.provider, url: r.url, free: r.free, official: r.official })),
      })),
      sponsored: list.filter(r => r.sponsored).map(r => ({ type: r.type, title: r.title, provider: r.provider, url: r.url })),
    } : null,
  };
}

function buildApi() {
  const dir = join(ROOT, "api", "v1");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, "certs"), { recursive: true });
  const write = (rel, data) => writeFileSync(join(dir, rel), JSON.stringify(data, null, 1) + "\n");
  const meta = {
    license: "CC BY 4.0", license_url: "https://creativecommons.org/licenses/by/4.0/",
    attribution: "Data from cert/map (https://certmap.dev/)", updated: latest,
  };

  write("index.json", {
    name: "cert/map API", version: "v1", ...meta,
    docs: SITE + "api/", openapi: SITE + "api/openapi.json",
    counts: { certifications: certs.length, vendors: vendors.size, domains: DOMAINS.length, comparisons: PAIRS.length, study_plans: RESOURCES.size },
    endpoints: {
      certifications: apiUrl("certs.json"), certification: apiUrl("certs/{id}.json"),
      vendors: apiUrl("vendors.json"), domains: apiUrl("domains.json"),
      comparisons: apiUrl("comparisons.json"), paths: apiUrl("paths.json"),
    },
  });
  write("certs.json", { ...meta, count: certs.length, certifications: certs.map(apiCertSummary) });
  for (const c of certs) write(`certs/${c.id}.json`, { ...meta, certification: apiCert(c) });
  write("vendors.json", { ...meta, count: vendors.size, vendors: [...vendors].sort((a, b) => a.localeCompare(b)).map(v => ({
    name: v, page: SITE + `certs/${vendorFile(v)}`, certifications: certs.filter(c => c.vendor === v).map(c => c.id),
  })) });
  write("domains.json", { ...meta, count: DOMAINS.length, domains: DOMAINS.map(d => ({
    name: d, page: SITE + `certs/${domainFile(d)}`, certifications: certs.filter(c => c.domain === d).map(c => c.id),
  })) });
  write("comparisons.json", { ...meta, count: PAIRS.length, comparisons: PAIRS.map(r => ({
    a: r.a, b: r.b,
    pages: Object.fromEntries(LANG_ORDER.map(code => [code, SITE + comparePath(byId.get(r.a), byId.get(r.b), LANGS[code])])),
  })) });
  write("paths.json", { ...meta, count: ROLE_PATHS.length, paths: ROLE_PATHS.map(p => ({
    id: p.id, name: p.name, certifications: pathCerts(p).map(c => c.id), ...pathTotals(pathCerts(p)), page: SITE + `certs/${pathFile(p)}`,
  })) });

  const ref = name => ({ $ref: `#/components/schemas/${name}` });
  const ok = (summary, schema) => ({ get: { summary, responses: { 200: { description: "OK", content: { "application/json": { schema } } } } } });
  writeFileSync(join(ROOT, "api", "openapi.json"), JSON.stringify({
    openapi: "3.1.0",
    info: { title: "cert/map API", version: "1.0.0", description: "Read-only, static JSON about cybersecurity certifications: prices, prerequisites, study plans and comparisons. No key, no rate limit; please cache.", license: { name: "CC BY 4.0", url: meta.license_url } },
    servers: [{ url: SITE + "api/v1" }],
    paths: {
      "/index.json": ok("Entry point: counts and endpoint URLs", { type: "object" }),
      "/certs.json": ok("Every certification, summarised", { type: "object", properties: { count: { type: "integer" }, certifications: { type: "array", items: ref("CertificationSummary") } } }),
      "/certs/{id}.json": { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" }, example: "oscp" }], ...ok("One certification in full, with its study plan and comparisons", { type: "object", properties: { certification: ref("Certification") } }) },
      "/vendors.json": ok("Vendors and the ids of their certifications", { type: "object" }),
      "/domains.json": ok("Domains and the ids of their certifications", { type: "object" }),
      "/comparisons.json": ok("Certification pairs that have a comparison page, per language", { type: "object" }),
      "/paths.json": ok("Preset role paths with cost and study-time totals", { type: "object" }),
    },
    components: { schemas: {
      CertificationSummary: { type: "object", properties: {
        id: { type: "string" }, acronym: { type: "string" }, name: { type: "string" }, vendor: { type: "string" }, issuer: { type: ["string", "null"] },
        domain: { type: "string", enum: DOMAINS }, level: { type: "string", enum: LEVELS },
        price_usd: { type: ["number", "null"], description: "Exam list price in USD. null when not published, 0 when free." },
        hands_on: { type: "boolean" }, page: { type: "string", format: "uri" }, api: { type: "string", format: "uri" } } },
      Certification: { allOf: [ref("CertificationSummary"), { type: "object", properties: {
        description: { type: "string" }, tags: { type: "array", items: { type: "string" } },
        price_verified_at: { type: ["string", "null"], format: "date" }, duration_min: { type: ["integer", "null"] },
        validity_years: { type: "integer", description: "0 means it does not expire." }, dod_8140: { type: "boolean" },
        prerequisites: { type: "array", items: { type: "string" } }, leads_to: { type: "array", items: { type: "string" } },
        official_url: { type: "string", format: "uri" }, comparisons: { type: "array", items: { type: "object" } },
        study_plan: { type: ["object", "null"], description: "Ordered preparation steps in four phases: know, learn, practice, test." } } }] },
    } },
  }, null, 1) + "\n");
  return certs.length + 7;
}

function apiPage() {
  const sample = byId.get("oscp") || certs[0];
  const code = text => `<pre><code>${esc(text)}</code></pre>`;
  const row = (path, what) => `      <tr><td><a href="v1/${path.replace("{id}", sample.id)}"><code>/api/v1/${path}</code></a></td><td>${what}</td></tr>`;
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / API</nav>
<article>
  <h1>cert/map API</h1>
  <p class="lead">The certification data as plain JSON: prices, levels, prerequisites, study plans and comparisons for ${certs.length} cybersecurity certifications. Free to use, no key, callable from a browser.</p>
  <p class="cta"><a class="btn primary" href="v1/index.json">Open the entry point</a> <a class="btn" href="openapi.json">OpenAPI description</a></p>
  <h2>Endpoints</h2>
  <table>
    <thead><tr><th>URL</th><th>Returns</th></tr></thead>
    <tbody>
${row("index.json", "Counts and the URL of every endpoint")}
${row("certs.json", "Every certification, summarised: vendor, domain, level, price")}
${row("certs/{id}.json", "One certification in full, with its study plan and comparisons")}
${row("vendors.json", "Vendors and the ids of their certifications")}
${row("domains.json", "Domains and the ids of their certifications")}
${row("comparisons.json", "Pairs that have a comparison page, with the page in each language")}
${row("paths.json", "Preset role paths with cost and study-time totals")}
    </tbody>
  </table>
  <h2>Example</h2>
  <p>Show the current exam price of a certification on your own page:</p>
${code(`const res = await fetch("${apiUrl(`certs/${sample.id}.json`)}");
const { certification } = await res.json();
console.log(certification.acronym, certification.price_usd);   // ${sample.acronym} ${sample.price_usd}`)}
  <h2>How it works</h2>
  <ul class="diff">
    <li>It is static. The files are regenerated whenever the dataset changes, so there is nothing to query: fetch a file and filter it on your side.</li>
    <li>Cross-origin requests are allowed, so it works from client-side code on any site.</li>
    <li>Responses are cached for about ten minutes. Please cache on your side too instead of fetching on every page view.</li>
    <li>URLs under <code>/api/v1/</code> keep their shape. A breaking change would be published as <code>v2</code>.</li>
    <li><code>price_usd</code> is the exam list price in US dollars: <code>null</code> when the vendor does not publish one, <code>0</code> when it is free. <code>price_verified_at</code> is the date it was last seen on the vendor's page.</li>
  </ul>
  <h2>Licence and attribution</h2>
  <p>The data is published under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>. You can use it in any project, commercial or not, as long as you credit cert/map with a link to <a href="../">certmap.dev</a>. Prices change without notice, so tell your readers to confirm with the vendor.</p>
  <p>The whole dataset is also available as single files: <a href="../data/certs.json">certs.json</a>, <a href="../data/certs.csv">certs.csv</a>, <a href="../data/resources.csv">resources.csv</a> and <a href="../data/comparisons.csv">comparisons.csv</a>.</p>
</article>`;
  return page({
    path: "api/",
    title: "cert/map API: free JSON data on cybersecurity certifications",
    description: `A free, static JSON API with the price, level, prerequisites, study plan and comparisons of ${certs.length} cybersecurity certifications. No key, CORS enabled, CC BY 4.0.`,
    body, modified: latest,
    ld: [{ "@context": "https://schema.org", "@type": "WebAPI", name: "cert/map API", url: SITE + "api/", documentation: SITE + "api/",
      description: "Read-only JSON about cybersecurity certifications.", license: "https://creativecommons.org/licenses/by/4.0/",
      provider: { "@type": "Organization", name: "cert/map", url: SITE } }],
  });
}

// ---------- sponsors ----------
// data/sponsors.json lists the sponsors of each tier as { name, url, logo },
// with `logo` a path under images/. Tiers always show a fixed number of places:
// real sponsors first, then empty ones that invite the reader to take them.
const TIERS = [
  { id: "gold", name: "Gold", places: 2 },
  { id: "silver", name: "Silver", places: 3 },
  { id: "bronze", name: "Bronze", places: 5 },
];
const SPONSOR_MAIL = `mailto:${EMAIL}?subject=${encodeURIComponent("Sponsoring cert/map")}`;

const sponsorData = () => JSON.parse(readFileSync(join(ROOT, "data", "sponsors.json"), "utf8"));
const sponsorLogo = sp => `<a class="slot" href="${esc(sp.url)}" rel="sponsored noopener" title="${esc(sp.name)}"><img src="../${esc(sp.logo)}" alt="${esc(sp.name)}" loading="lazy"></a>`;

// What each tier includes. Kept here, next to the markup, so the page never
// promises a placement the site does not actually render.
const TIER_TERMS = {
  gold: ["Largest logo, shown first on the home page and on this page", "Logo in the sidebar of the interactive roadmap", "Credit in the project README on GitHub"],
  silver: ["Logo on the home page and on this page", "Credit in the project README on GitHub"],
  bronze: ["Logo on the home page and on this page"],
};

function tierCard(t, data) {
  const taken = data[t.id] || [];
  const open = Math.max(0, t.places - taken.length);
  const places = [
    ...taken.map(sponsorLogo),
    ...Array.from({ length: open }, () => `<span class="slot empty"><span>Open</span></span>`),
  ];
  return `  <div class="tier tier-${t.id}">
    <div class="tier-head"><h3>${t.name}</h3><span>${t.places} places · ${open ? `${open} open` : "full"}</span></div>
    <ul class="tier-terms">${TIER_TERMS[t.id].map(x => `<li>${x}</li>`).join("")}</ul>
    <div class="slots">${places.join("")}</div>
  </div>`;
}

// Home page: a short, plain statement. Logos appear here once there are
// sponsors; until then there is nothing to fill and nothing that looks empty.
function sponsorsSection() {
  const data = sponsorData();
  const all = TIERS.flatMap(t => (data[t.id] || []).map(sp => ({ ...sp, tier: t.id })));
  const logos = all.length
    ? `  <div class="supporters">${all.map(sp => `<span class="supporter tier-${sp.tier}">${sponsorLogo(sp)}</span>`).join("")}</div>\n`
    : "";
  return `<section class="block" id="sponsors">
  <h2>${all.length ? "Supported by" : "Independent by design"}</h2>
${logos}  <div class="support">
    <div>
      <strong>No ads, no tracking, nothing for sale in the data</strong>
      <span>cert/map is funded by a small number of sponsors: organisations that train, hire or equip security professionals. Sponsorship is by arrangement and never touches what is listed.</span>
    </div>
    <a class="btn" href="../sponsors/">Sponsorship</a>
  </div>
</section>`;
}

function sponsorFaq() {
  return [
    ["Who reads cert/map?",
      "People deciding which cybersecurity certification to take next: students and career changers choosing a first credential, practitioners planning a specialism such as penetration testing, cloud security or incident response, and team leads mapping training for their staff. They arrive comparing price, exam format and prerequisites, in the middle of a training decision."],
    ["What does a sponsor get?",
      "A place in one of three tiers, with your logo linked to your site. Each tier lists exactly where the logo appears. Gold places are the largest and come first, then silver, then bronze."],
    ["How many sponsors are there?",
      `Ten at most: ${TIERS.map(t => `${t.places} ${t.name.toLowerCase()}`).join(", ")}. The number is fixed so that a place stays visible and the pages stay uncluttered.`],
    ["Can a certification vendor or training provider sponsor?",
      "Yes, on the same terms as anyone else. Sponsoring does not add, remove, move or reword any certification. Listings follow the published data and the contribution rules, and sponsored places are marked as such."],
    ["Do you provide traffic figures?",
      "cert/map runs no analytics and no tracking scripts, by choice. On request you get what exists without them: search impressions and clicks from the search console, and the public activity of the repository."],
    ["How does it start?",
      `Write to ${EMAIL} with your organisation and the tier that interests you. You get the terms by reply; once agreed, your logo goes live with the next update of the site.`],
  ];
}

function sponsorsPage() {
  const data = sponsorData();
  const qa = sponsorFaq();
  const pages = certs.length + vendors.size + DOMAINS.length + LISTS.length + ROLE_PATHS.length;
  const total = TIERS.reduce((n, t) => n + t.places, 0);
  const stat = (n, label) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`;
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / Sponsorship</nav>
<section class="hero">
  <p class="kicker">Sponsorship</p>
  <h1>Sponsor the open cybersecurity certification roadmap</h1>
  <p class="lead">${total} places in three tiers, for organisations that train, hire or equip the people who plan their security careers here.</p>
  <p class="cta"><a class="btn primary big" href="#tiers">See the tiers</a> <a class="btn big" href="${SPONSOR_MAIL}">Enquire</a></p>
  <div class="stats">${stat(certs.length, "certifications tracked")}${stat(vendors.size, "vendors covered")}${stat(pages, "reference pages")}${stat("0", "ads or trackers")}</div>
</section>

<section class="block">
  <h2>Who you reach</h2>
  <ol class="steps three plain">
    <li><strong>People mid-decision</strong><span>Readers come to compare certifications by cost, level and exam format. They are students, practitioners and team leads choosing where to spend training time and budget.</span></li>
    <li><strong>A reference, not a feed</strong><span>Every certification, vendor, domain and career path has its own page with current prices, so the site is opened again each time someone plans a next step.</span></li>
    <li><strong>A setting readers trust</strong><span>Open source, no ads, no tracking. A sponsor's name sits beside a resource where nothing in the data is for sale.</span></li>
  </ol>
</section>

<section class="block sponsors" id="tiers">
  <h2>Tiers</h2>
  <div class="tiers">
${TIERS.map(t => tierCard(t, data)).join("\n")}
  </div>
  <p class="fine">The first sponsor in each tier is listed as a founding sponsor. Terms and prices are sent on request, and places are assigned in the order they are agreed.</p>
</section>

<section class="block">
  <h2>How it works</h2>
  <ol class="steps three">
    <li><strong>Write</strong><span>Tell us who you are and which tier interests you, at ${EMAIL}.</span></li>
    <li><strong>Agree</strong><span>You receive the terms of the tier. Sponsorship runs for a fixed period and renews by agreement.</span></li>
    <li><strong>Go live</strong><span>Your logo is added with the next update of the site and stays for the agreed term.</span></li>
  </ol>
</section>

<section class="block">
  <h2>What sponsorship supports, and what it does not buy</h2>
  <div class="prose two">
    <p>Exam prices change without notice and vendors retire, rename and replace certifications every few months. Keeping ${certs.length} entries accurate means re-reading ${vendors.size} vendors' own pages and recording the date each price was last seen. Sponsorship funds that work, the hosting and the domain.</p>
    <p>It does not buy influence. Sponsoring never adds, removes, moves or rewords a certification, and sponsored places are labelled. The dataset stays open under CC BY 4.0 and the code under the MIT licence.</p>
  </div>
</section>

<section class="block">
  <h2>Questions</h2>
  <div class="faq">
${qa.map(([q, a], i) => `    <details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
  </div>
</section>

<section class="block">
  <div class="support">
    <div><strong>Sponsorship enquiries</strong><span><a href="mailto:${EMAIL}">${EMAIL}</a></span></div>
    <a class="btn primary" href="${SPONSOR_MAIL}">Enquire</a>
  </div>
</section>`;
  const url = SITE + "sponsors/";
  const ld = [
    { "@context": "https://schema.org", "@type": "WebPage", name: "Sponsor cert/map", url, isPartOf: { "@type": "WebSite", name: "cert/map", url: SITE },
      about: { "@type": "Thing", name: "Sponsorship of an open-source cybersecurity certification roadmap" } },
    { "@context": "https://schema.org", "@type": "Organization", name: "cert/map", url: SITE, logo: SITE + "favicon/web-app-manifest-512x512.png",
      contactPoint: { "@type": "ContactPoint", contactType: "sponsorship", email: EMAIL, availableLanguage: ["en", "es"] } },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "cert/map", item: SITE },
      { "@type": "ListItem", position: 2, name: "Sponsorship", item: url },
    ] },
  ];
  const image = "assets/og/sponsors.png";
  return page({
    path: "sponsors/",
    title: "Sponsor cert/map: reach people choosing cybersecurity certifications",
    description: `Sponsorship of the open-source cybersecurity certification roadmap: ${total} places in gold, silver and bronze tiers, in front of students and security professionals comparing ${certs.length} certifications. Independent, no ads, no tracking.`,
    body, ld, modified: latest,
    image: existsSync(join(ROOT, image)) ? image : undefined,
  });
}

// The roadmap's sidebar ends with the gold sponsors' logos, or with a plain
// link while there are none. Written between markers in map/index.html.
function sidebarSponsor() {
  const gold = sponsorData().gold || [];
  if (!gold.length) return `      <a class="sponsor-link" href="../sponsors/">Sponsorship</a>`;
  return `      <div class="sponsor-side"><span>Supported by</span>${gold.map(sp =>
    `<a href="${esc(sp.url)}" rel="sponsored noopener" title="${esc(sp.name)}"><img src="../${esc(sp.logo)}" alt="${esc(sp.name)}" loading="lazy"></a>`).join("")}</div>`;
}

// /about/ was the address of this page before it became the home page.
function aboutRedirect() {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>cert/map</title>
<link rel="canonical" href="${SITE}">
<meta http-equiv="refresh" content="0; url=../">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; base-uri 'self'; form-action 'none'">
<link rel="stylesheet" href="../assets/css/static.css?v=${STATIC_V}">
</head>
<body>
<main class="hero"><p class="lead">This page moved to the <a href="../">cert/map home page</a>.</p></main>
</body>
</html>
`;
}

// ---------- shared roadmap landing page ----------
// A roadmap lives in the URL fragment, which link-preview crawlers never see,
// so every shared roadmap would otherwise show the home page's preview. Shared
// links point at r/ instead: a tiny page with its own title and card that
// forwards the fragment to the app (assets/js/shared-link.js).
function sharedPage() {
  const title = "A cybersecurity certification roadmap, shared with you";
  const description = "Open it to see the certifications in order, with the exam cost and study time of the whole path. Built on cert/map.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | cert/map</title>
<meta name="description" content="${description}">
<meta name="robots" content="noindex, follow">
<link rel="canonical" href="${SITE}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="cert/map">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${SITE}r/">
<meta property="og:image" content="${SITE}assets/og/shared.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${SITE}assets/og/shared.png">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; base-uri 'self'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<meta name="theme-color" content="#0b0d12">
<link rel="icon" type="image/svg+xml" href="../favicon/favicon.svg">
<link rel="stylesheet" href="../assets/css/static.css?v=${STATIC_V}">
</head>
<body>
<main class="hero">
  <p class="kicker">Shared roadmap</p>
  <h1>Opening the roadmap</h1>
  <p class="lead">If nothing happens, <a id="open" href="../map/">open it in cert/map</a>.</p>
</main>
<script src="../assets/js/shared-link.js?v=${fileHash("assets/js/shared-link.js")}"></script>
</body>
</html>
`;
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
        + line("Vendor", c.vendor) + line("Issued by", c.issuer) + line("Level", c.level)
        + line("Exam price", money(c.price_usd) + (c.currency_note ? ` (${c.currency_note})` : ""))
        + line("Price checked", c.price_verified_at) + line("Exam length", duration(c.duration_min))
        + line("Exam format", c.hands_on ? "hands-on, performance-based" : "written or multiple choice")
        + line("Renewal", c.validity_years ? `every ${c.validity_years} years` : "does not expire")
        + line("Prerequisites", c.prerequisites.map(id => byId.get(id)?.acronym || id).join(", "))
        + line("DoD 8140", c.dod_8140 ? "approved" : "") + line("Restricted to", c.restricted_to)
        + line("Official page", c.url) + line("cert/map page", SITE + `certs/${c.id}.html`)
        + line("Study plan", RESOURCES.has(c.id) ? SITE + `certs/${planFile(c)}` : "")
        + line("Compared with", (VERSUS.get(c.id) || []).map(v => `${byId.get(v.id).acronym} (${SITE}certs/${v.file})`).join(", "))
        + ((RESOURCES.get(c.id) || []).length
          ? "- Preparation:\n" + RESOURCES.get(c.id).map(r => `  - ${r.title} (${r.provider}${r.official ? ", official" : ""}${r.free ? ", free" : ""}${r.sponsored ? ", sponsored" : ""}): ${r.url}\n`).join("")
          : "");
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

- [Home](${SITE}): what the roadmap is, with answers on cost, beginner options and exam formats
- [Interactive roadmap](${SITE}map/): the matrix of every certification by domain and level
- [Sponsors](${SITE}sponsors/): how to sponsor the project, the tiers and the terms
- [API](${SITE}api/): static JSON under \`${SITE}api/v1/\`, entry point ${SITE}api/v1/index.json, one file per certification at \`${SITE}api/v1/certs/<id>.json\` including its study plan, described in ${SITE}api/openapi.json
- [All certifications](${SITE}certs/): every certification with vendor, level and price
- [Full text digest](${SITE}llms-full.txt): every certification with all of its fields, in Markdown
- [Dataset as JSON](${SITE}data/certs.json) and [as CSV](${SITE}data/certs.csv)
- [Preparation resources (CSV)](${SITE}data/resources.csv): exam guides, courses, labs and books per certification, ${[...RESOURCES.values()].reduce((k, l) => k + l.length, 0)} links for ${RESOURCES.size} certifications
- Study plans: ${RESOURCES.size} certifications have an ordered plan at \`${SITE}certs/plan-<id>.html\`, for example ${SITE}certs/plan-oscp.html
- [Comparison pairs (CSV)](${SITE}data/comparisons.csv): the ${PAIRS.length} pairs that have a side-by-side page
- Comparison pages exist in eight languages. English is under \`certs/\`; the others use the same file name under \`es/\`, \`fr/\`, \`de/\`, \`it/\`, \`ar/\`, \`ko/\` and \`he/\`, for example ${SITE}es/${PAIRS.length ? compareFile(PAIRS[0].a, PAIRS[0].b) : "compare-a-vs-b.html"}
${LISTS.map(l => `- [${l.name}](${SITE}certs/${listFile(l)}): ${listItems(l).length} certifications`).join("\n")}
${ROLE_PATHS.map(p => `- [${p.name} certification path](${SITE}certs/${pathFile(p)}): ${pathCerts(p).map(c => c.acronym).join(", ")}`).join("\n")}
${PAIRS.map(r => `- [${byId.get(r.a).acronym} vs ${byId.get(r.b).acronym}](${SITE}certs/${compareFile(r.a, r.b)})`).join("\n")}
${DOMAINS.map(d => `- [${d} certifications](${SITE}certs/${domainFile(d)})`).join("\n")}

Each certification has its own page at \`${SITE}certs/<id>.html\`.

## Vendor pages

${[...vendors].sort((x, y) => x.localeCompare(y)).map(v => `- [${v} certifications](${SITE}certs/${vendorFile(v)}): ${certs.filter(c => c.vendor === v).length}`).join("\n")}

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
  const index = join(ROOT, "map", "index.html");
  const before = readFileSync(index, "utf8");
  const after = strip(before).replace(/("\.\.\/assets\/(?:js|css|vendor)\/[^"?]+\.(?:js|css))"/g, `$1?v=${v}"`);
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

// The vendor's own site: the origin most of its certification pages share.
// Course platforms host other issuers' certificates, so they keep theirs too.
function vendorSite(items) {
  const hosts = count(items.map(c => { try { return { h: new URL(c.url).origin }; } catch { return { h: "" }; } }), "h");
  return [...hosts.entries()].filter(([h]) => h).sort((x, y) => y[1] - x[1])[0]?.[0] || "";
}

// One page per vendor, written for someone searching the brand together with
// "certifications", "cost" or "which first": the full list, the price range,
// where to start, what expires, how its exams are assessed and how its
// certifications compare with others.
function vendorPage(vendor) {
  const items = certs.filter(c => c.vendor === vendor).sort(byLevelThenName);
  const domains = [...count(items, "domain").keys()];
  const path = `certs/${vendorFile(vendor)}`;
  const site = vendorSite(items);
  const n = items.length;
  const plural = n === 1 ? "certification" : "certifications";
  const priced = items.filter(c => c.price_usd > 0).sort((x, y) => x.price_usd - y.price_usd);
  const first = [...items].sort((x, y) => LEVELS.indexOf(x.level) - LEVELS.indexOf(y.level) || y.weight - x.weight || byName(x, y))[0];
  const expiring = items.filter(c => c.validity_years);
  const handsOn = items.filter(c => c.hands_on).length;
  const pairs = [...new Map(items.flatMap(c => (VERSUS.get(c.id) || []).map(v => [v.file, v]))).values()];
  const pairLabel = v => { const [x, y] = v.file.replace(/^compare-|\.html$/g, "").split("-vs-"); return `${byId.get(x).acronym} vs ${byId.get(y).acronym}`; };
  const levelsLine = LEVELS.map(l => [l, items.filter(c => c.level === l).length]).filter(([, k]) => k).map(([l, k]) => `${k} ${l}`).join(", ");

  const qa = [
    [`How many ${vendor} certifications are there?`,
      `cert/map lists ${n} ${vendor} ${plural}: ${levelsLine}.`],
    [`How much do ${vendor} certifications cost?`,
      priced.length
        ? (priced.length === 1 || priced[0].price_usd === priced.at(-1).price_usd
          ? `The published exam price is ${money(priced[0].price_usd)} (${priced[0].acronym}).`
          : `Published exam prices run from ${money(priced[0].price_usd)} (${priced[0].acronym}) to ${money(priced.at(-1).price_usd)} (${priced.at(-1).acronym}).`)
          + (priced.length < n ? ` ${n - priced.length} of the ${n} have no published standalone price or are free.` : "")
        : `${vendor} does not publish standalone exam prices for the certifications listed here.`],
    [`Which ${vendor} certification should I start with?`,
      n === 1
        ? `${first.acronym} is the only ${vendor} certification on the roadmap. It sits at ${first.level} level.`
        : `The lowest tier on the roadmap is ${first.level}, and ${first.acronym} (${first.name}) is the usual entry point there.`],
    [`Do ${vendor} certifications expire?`,
      expiring.length === 0 ? `None of the ${vendor} certifications listed here expires.`
        : expiring.length === n ? `Yes. All of them have a renewal cycle, for example ${expiring[0].acronym} every ${expiring[0].validity_years} ${expiring[0].validity_years === 1 ? "year" : "years"}.`
        : `${expiring.length} of the ${n} have a renewal cycle (for example ${expiring[0].acronym}, every ${expiring[0].validity_years} ${expiring[0].validity_years === 1 ? "year" : "years"}); the rest do not expire.`],
    [`Are ${vendor} exams hands-on?`,
      handsOn === 0 ? `The ${vendor} exams listed here are written or multiple choice.`
        : handsOn === n ? `Yes. Every ${vendor} exam listed here is practical and performance-based.`
        : `${handsOn} of the ${n} are assessed with a practical, performance-based exam; the others are written or multiple choice.`],
  ];

  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / <a href="./">Certifications</a> / ${esc(vendor)}</nav>
<h1>${esc(vendor)} certifications</h1>
<p class="lead">${n === 1 ? "The one" : `All ${n}`} ${esc(vendor)} ${plural} on the cert/map security certification roadmap, ordered from beginner to expert, with the domain each one belongs to and its current exam price.${esc(priceRange(items))}</p>
<p class="cta"><a class="btn primary" href="../map/?vendor=${encodeURIComponent(vendor)}">Open ${esc(vendor)} in the interactive roadmap</a>${site ? ` <a class="btn" href="${esc(site)}/" rel="noopener noreferrer">Official ${esc(vendor)} site</a>` : ""}</p>
${certTable(items, { showVendor: false, showDomain: true })}
<h2>${esc(vendor)} certifications at a glance</h2>
<div class="faq">
${qa.map(([q, ans], i) => `  <details${i === 0 ? " open" : ""}><summary>${esc(q)}</summary><p>${esc(ans)}</p></details>`).join("\n")}
</div>
${pairs.length ? `<h2>${esc(vendor)} certifications compared</h2>\n<nav class="toc">${pairs.map(v => `<a href="${v.file}">${esc(pairLabel(v))}</a>`).join(" ")}</nav>\n` : ""}<h2>Domains covered</h2>
<nav class="toc">${domains.map(d => `<a href="${domainFile(d)}">${esc(d)}</a>`).join(" ")}</nav>
<p class="fine">cert/map is independent and is not affiliated with ${esc(vendor)}. Names and marks belong to their owners.</p>`;
  const ld = [
    ...itemListLd(`${vendor} certifications`, path, items).map(x => ({
      ...x, about: { "@type": "Organization", name: vendor, ...(site ? { url: site + "/" } : {}) },
    })),
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map(([q, ans]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: ans } })) },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "cert/map", item: SITE },
      { "@type": "ListItem", position: 2, name: "Certifications", item: SITE + "certs/" },
      { "@type": "ListItem", position: 3, name: vendor, item: SITE + path },
    ] },
  ];
  return page({
    path, title: `${vendor} certifications: full list, cost and levels (${year()}) | cert/map`,
    description: `${n} ${vendor} ${plural} compared: ${items.slice(0, 6).map(c => c.acronym).join(", ")}${n > 6 ? " and more" : ""}.${priceRange(items)} Levels, renewal, exam format and where to start.`.slice(0, 300),
    body, ld, modified: latest,
  });
}

function domainPage(domain) {
  const items = certs.filter(c => c.domain === domain).sort(byLevelThenName);
  const path = `certs/${domainFile(domain)}`;
  const levels = LEVELS.filter(l => items.some(c => c.level === l));
  const body = `<nav class="crumbs" aria-label="Breadcrumb"><a href="../">cert/map</a> / <a href="./">Certifications</a> / ${esc(domain)}</nav>
<h1>${esc(domain)} certifications</h1>
<p class="lead">${items.length} ${esc(domain)} certifications from ${count(items, "vendor").size} vendors, laid out as a path from beginner to expert with the current exam price of each.${esc(priceRange(items))}</p>
<p class="cta"><a class="btn primary" href="../map/#/domain/${slug(domain)}">Open ${esc(domain)} in the interactive roadmap</a></p>
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
    c.issuer ? ["Issued by", esc(c.issuer)] : null,
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
  <p class="cta"><a class="btn primary" href="../map/#/cert/${c.id}">Open ${esc(c.acronym)} in the interactive roadmap</a> <a class="btn" href="${esc(c.url)}" rel="noopener noreferrer">Official ${esc(c.vendor)} page</a></p>
  <h2>${esc(c.acronym)} cost, exam and renewal</h2>
  <dl class="facts">
${facts.map(([k, v]) => `    <div><dt>${k}</dt><dd>${v}</dd></div>`).join("\n")}
  </dl>
${c.tags.length ? `  <p class="tags">${c.tags.map(t => `<a href="../map/?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join(" ")}</p>\n` : ""}${related.length ? `  <h2>Other ${esc(c.domain)} certifications</h2>
  <ul class="related">
${related.map(o => `    <li>${certLink(o)} <span>${esc(o.vendor)}, ${LEVEL_LABEL[o.level]}, ${esc(money(o.price_usd))}</span></li>`).join("\n")}
  </ul>\n` : ""}${prepHtml(c)}${versusHtml(c)}</article>`;

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
<p class="cta"><a class="btn primary" href="../map/">Open the interactive roadmap</a> <a class="btn" href="../data/certs.csv">Download the dataset (CSV)</a></p>
${PAIRS.length ? `<h2 id="comparisons">Comparisons</h2>
<nav class="toc" aria-label="Comparisons">${PAIRS.map(r => `<a href="${compareFile(r.a, r.b)}">${esc(byId.get(r.a).acronym)} vs ${esc(byId.get(r.b).acronym)}</a>`).join(" ")}</nav>
` : ""}<h2>Popular lists</h2>
<nav class="toc" aria-label="Lists">${LISTS.map(l => `<a href="${listFile(l)}">${esc(l.name)}</a>`).join(" ")}</nav>
<h2 id="plans">Study plans</h2>
<nav class="toc" aria-label="Study plans">${certs.filter(c => RESOURCES.has(c.id)).sort(byName).map(c => `<a href="${planFile(c)}">${esc(c.acronym)}</a>`).join(" ")}</nav>
<h2>Career paths</h2>
<nav class="toc" aria-label="Paths">${ROLE_PATHS.map(p => `<a href="${pathFile(p)}">${esc(p.name)}</a>`).join(" ")}</nav>
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
    url(SITE + "map/", latest, "0.9"),
    url(SITE + "sponsors/", latest, "0.8"),
    url(SITE + "api/", latest, "0.7"),
    ...LISTS.map(l => url(SITE + `certs/${listFile(l)}`, latest, "0.8")),
    ...ROLE_PATHS.map(p => url(SITE + `certs/${pathFile(p)}`, latest, "0.8")),
    ...certs.filter(c => RESOURCES.has(c.id)).map(c => url(SITE + `certs/${planFile(c)}`, latest, "0.8")),
    ...PAIRS.flatMap(r => LANG_ORDER.map(code => url(SITE + comparePath(byId.get(r.a), byId.get(r.b), LANGS[code]), latest, code === "en" ? "0.8" : "0.6"))),
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
    .replace(/\b\d+ domains\b/g, `${DOMAINS.length} domains`)
    .replace(/\bcompare \d+ certs\b/g, `compare ${certs.length} certs`)
    .replace(/(<!-- build:sponsor -->)[\s\S]*?(<!-- \/build:sponsor -->)/, `$1\n${sidebarSponsor()}\n      $2`)
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
for (const p of ROLE_PATHS) writeFileSync(join(OUT, pathFile(p)), pathPage(p));
for (const c of certs) if (RESOURCES.has(c.id)) writeFileSync(join(OUT, planFile(c)), planPage(c));
for (const code of LANG_ORDER) {
  const T = LANGS[code];
  if (code !== "en") { rmSync(join(ROOT, code), { recursive: true, force: true }); mkdirSync(join(ROOT, code), { recursive: true }); }
  for (const r of PAIRS) {
    const a = byId.get(r.a), b = byId.get(r.b);
    writeFileSync(join(ROOT, comparePath(a, b, T)), comparePage(a, b, T));
  }
}
writeFileSync(join(OUT, "index.html"), hubPage());
mkdirSync(join(ROOT, "r"), { recursive: true });
writeFileSync(join(ROOT, "r", "index.html"), sharedPage());
mkdirSync(join(ROOT, "about"), { recursive: true });
writeFileSync(join(ROOT, "about", "index.html"), aboutRedirect());
writeFileSync(join(ROOT, "index.html"), homePage());
const apiFiles = buildApi();
writeFileSync(join(ROOT, "api", "index.html"), apiPage());
mkdirSync(join(ROOT, "sponsors"), { recursive: true });
writeFileSync(join(ROOT, "sponsors", "index.html"), sponsorsPage());
writeFileSync(join(ROOT, "llms-full.txt"), llmsFull());
writeFileSync(join(ROOT, "data", "certs.json"), "[\n" + certs.map(c => JSON.stringify(c)).join(",\n") + "\n]\n");
refreshLlms();
const version = stampAssets();
writeFileSync(join(ROOT, "sitemap.xml"), sitemap());
refreshCounts("map/index.html");
refreshCounts("llms.txt");
refreshCounts("README.md");
console.log(`OK: ${certs.length} certification, ${vendors.size} vendor, ${DOMAINS.length} domain and ${LISTS.length} list pages, about/, llms-full.txt, certs.json, sitemap.xml, ${apiFiles} API files. Assets v=${version}.`);
