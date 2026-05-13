
const DOMAINS = [
  "Communication & Network Security", "IAM", "Security Architecture & Engineering",
  "Asset Security", "Security & Risk Management",
  "Software Security", "Security Operations", "Cyber Threat Intelligence",
  "Cloud/SysOps", "*nix", "ICS/IoT", "GRC", "Forensics", "Incident Handling",
  "Penetration Testing", "Exploitation"
];
const LEVELS = ["beginner", "intermediate", "advanced", "expert"];

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

const toNum = v => (v === "" || v == null ? null : Number(v));
const toBool = v => String(v).trim().toLowerCase() === "true";
const toList = v => (v ? v.split(";").map(s => s.trim()).filter(Boolean) : []);

function rowsToCerts(rows) {
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
  }));
}

function buildMeta(certs) {
  const prices = certs.map(c => c.price_usd).filter(n => Number.isFinite(n));
  return {
    count: certs.length,
    domains: DOMAINS,
    levels: LEVELS,
    vendors: [...new Set(certs.map(c => c.vendor))].sort((a, b) => a.localeCompare(b)),
    tags: [...new Set(certs.flatMap(c => c.tags))].sort(),
    price_min: prices.length ? Math.min(...prices) : 0,
    price_max: prices.length ? Math.max(...prices) : 0,
  };
}

export async function loadData() {
  const res = await fetch("data/certs.csv");
  if (!res.ok) throw new Error(`Failed to fetch certs.csv: ${res.status}`);
  const text = await res.text();
  const certs = rowsToCerts(parseCSV(text));
  const meta = buildMeta(certs);
  const byId = new Map(certs.map(c => [c.id, c]));
  return { certs, meta, byId };
}
