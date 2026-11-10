
export const DOMAINS = [
  "Communication & Network Security", "IAM", "Security Architecture & Engineering",
  "Asset Security", "Security & Risk Management",
  "Software Security", "Security Operations", "Cyber Threat Intelligence", "OSINT",
  "Cloud/SysOps", "*nix", "ICS/IoT", "GRC", "Forensics", "Incident Handling",
  "Penetration Testing", "Exploitation"
];
const LEVELS = ["beginner", "intermediate", "advanced", "expert"];

export function parseCSV(text) {
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

const toNum = v => (v === "" || v == null ? null : Number(v));
const toBool = v => String(v).trim().toLowerCase() === "true";
const toList = v => (v ? v.split(";").map(s => s.trim()).filter(Boolean) : []);

export function rowsToCerts(rows) {
  const header = rows.shift();
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  return rows.map(r => ({
    id: r[idx.id]?.trim(),
    name: r[idx.name]?.trim(),
    acronym: r[idx.acronym]?.trim(),
    vendor: r[idx.vendor]?.trim(),
    domain: r[idx.domain]?.trim(),
    level: r[idx.level]?.trim(),
    price_usd: toNum(r[idx.price_usd]),
    currency_note: r[idx.currency_note]?.trim() || "",
    duration_min: toNum(r[idx.duration_min]),
    validity_years: toNum(r[idx.validity_years]),
    prerequisites: toList(r[idx.prerequisites]),
    dod_8140: toBool(r[idx.dod_8140]),
    url: r[idx.url]?.trim(),
    description: r[idx.description]?.trim() || "",
    tags: toList(r[idx.tags]),
    weight: toNum(r[idx.weight]) ?? 0,
    restricted_to: r[idx.restricted_to]?.trim() || "",
    exam_count: toNum(r[idx.exam_count]) ?? 1,
    renewal_cost: toNum(r[idx.renewal_cost]),
    hands_on: toBool(r[idx.hands_on]),
    price_verified_at: r[idx.price_verified_at]?.trim() || "",
    issuer: r[idx.issuer]?.trim() || "",
  }));
}

function buildMeta(certs) {
  const prices = certs.map(c => c.price_usd).filter(n => Number.isFinite(n));
  const tally = key => certs.reduce((m, c) => m.set(c[key], (m.get(c[key]) || 0) + 1), new Map());
  return {
    domainCount: tally("domain"),
    vendorCount: tally("vendor"),
    count: certs.length,
    domains: DOMAINS,
    levels: LEVELS,
    vendors: [...new Set(certs.map(c => c.vendor))].sort((a, b) => a.localeCompare(b)),
    tags: [...new Set(certs.flatMap(c => c.tags))].sort(),
    price_min: prices.length ? Math.min(...prices) : 0,
    price_max: prices.length ? Math.max(...prices) : 0,
  };
}

// Any CSV with a header row, as an array of objects keyed by column name.
export function tableFromCSV(text) {
  const rows = parseCSV(text);
  const header = (rows.shift() || []).map(h => h.trim());
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] || "").trim()])));
}

export const RESOURCE_TYPES = ["guide", "course", "lab", "practice", "book"];

// Preparation resources by cert id. Sponsored ones are kept apart from the
// rest so they can never be mistaken for an editorial pick.
export function groupResources(rows, byId) {
  const out = new Map();
  for (const r of rows) {
    if (!byId.has(r.cert_id) || !/^https:\/\//.test(r.url) || !RESOURCE_TYPES.includes(r.type)) continue;
    const item = { type: r.type, title: r.title, provider: r.provider, url: r.url,
      free: r.free === "true", official: r.official === "true", sponsored: r.sponsored === "true" };
    if (!out.has(r.cert_id)) out.set(r.cert_id, []);
    out.get(r.cert_id).push(item);
  }
  const order = x => (x.official ? 0 : 1) * 10 + RESOURCE_TYPES.indexOf(x.type);
  for (const list of out.values()) list.sort((a, b) => order(a) - order(b));
  return out;
}

// Comparison pairs by cert id: for each cert, the certs it is compared with
// and the name of the page that holds the comparison.
export const compareFile = (a, b) => `compare-${a}-vs-${b}.html`;
export function groupComparisons(rows, byId) {
  const out = new Map();
  const seen = new Set();
  for (const { a, b } of rows) {
    if (!byId.has(a) || !byId.has(b) || a === b || seen.has([a, b].sort().join("|"))) continue;
    seen.add([a, b].sort().join("|"));
    for (const [x, y] of [[a, b], [b, a]]) {
      if (!out.has(x)) out.set(x, []);
      out.get(x).push({ id: y, file: compareFile(a, b) });
    }
  }
  return out;
}

async function optionalTable(path) {
  try {
    const res = await fetch(new URL(path, import.meta.url), { cache: "no-cache" });
    return res.ok ? tableFromCSV(await res.text()) : [];
  } catch { return []; }
}

export async function loadData() {
  // Revalidate on every load so a price fix is visible as soon as it deploys.
  // Resolved against this module, not the page, so it works wherever the app lives.
  const res = await fetch(new URL("../../data/certs.csv", import.meta.url), { cache: "no-cache" });
  if (!res.ok) throw new Error(`Failed to fetch certs.csv: ${res.status}`);
  const text = await res.text();
  const certs = rowsToCerts(parseCSV(text));
  const meta = buildMeta(certs);
  const byId = new Map(certs.map(c => [c.id, c]));
  const [resources, comparisons] = await Promise.all([
    optionalTable("../../data/resources.csv"),
    optionalTable("../../data/comparisons.csv"),
  ]);
  return { certs, meta, byId, resources: groupResources(resources, byId), comparisons: groupComparisons(comparisons, byId) };
}
