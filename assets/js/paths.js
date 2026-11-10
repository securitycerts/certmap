// Everything about a certification path that is not rendering: the preset role
// paths, the order certs should be taken in, the totals, and the note codec
// used by shared roadmap links. Pure functions, so the build scripts import
// this module too.

import { LEVEL_ORDER, LEVEL_HOURS } from "./format.js?v=75415574";

export const ROLE_PATHS = [
  { id: "pentester", name: "Penetration tester", certs: ["ejpt", "pjpt", "oscp", "pnpt", "osep"] },
  { id: "red-team-operator", name: "Red team operator", certs: ["oscp", "osep", "crto", "osed", "oswe"] },
  { id: "soc-analyst", name: "SOC analyst", certs: ["sec-plus", "cysa-plus", "gcih", "splunk-cda", "osda"] },
  { id: "dfir-investigator", name: "DFIR investigator", certs: ["gcfe", "gcfa", "grem", "gnfa", "encase"] },
  { id: "threat-intel-analyst", name: "Threat intelligence analyst", certs: ["sec-plus", "gosi", "gcti", "ctia", "gdat"] },
  { id: "appsec-engineer", name: "Application security engineer", certs: ["sec-plus", "csslp", "oswa", "gwapt", "oswe"] },
  { id: "cloud-security", name: "Cloud security architect", certs: ["sec-plus", "ccsk", "aws-scs", "sc-500", "ccsp"] },
  { id: "grc-manager", name: "GRC manager", certs: ["cisa", "cgrc", "cism", "crisc", "cissp"] },
];

// Topologically order the selected certs so prerequisites come before the certs
// that need them, falling back to level then acronym. Anything we can't place
// (a cycle, or a prerequisite that isn't selected) is appended at the end.
export function orderByPrerequisite(selected) {
  const inSet = new Set(selected.map(c => c.id));
  const placed = new Set();
  const ordered = [];
  let safety = selected.length + 1;
  while (placed.size < selected.length && safety-- > 0) {
    const ready = selected
      .filter(c => !placed.has(c.id) && c.prerequisites.every(p => !inSet.has(p) || placed.has(p)))
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.acronym.localeCompare(b.acronym));
    if (!ready.length) break;
    for (const c of ready) { ordered.push(c); placed.add(c.id); }
  }
  for (const c of selected) if (!placed.has(c.id)) ordered.push(c);
  return ordered;
}

export function pathTotals(certs) {
  const hours = certs.reduce((a, c) => a + LEVEL_HOURS[c.level], 0);
  return {
    hours,
    months: Math.round(hours / 10 / 4.3 * 10) / 10,
    cost: certs.reduce((a, c) => a + (c.price_usd || 0), 0),
    unknown: certs.filter(c => c.price_usd == null).length,
  };
}

export function pathSummary(certs) {
  const t = pathTotals(certs);
  return `${certs.length} ${certs.length === 1 ? "certification" : "certifications"} · ${t.hours}h of study ≈ ${t.months} months at 10h a week · $${t.cost.toLocaleString("en-US")}`
    + (t.unknown ? ` plus ${t.unknown} with no published price` : "");
}

// ---------- notes ----------
// A note is a short free-text annotation on one certification of a roadmap
// ("employer pays", "target: March"). Notes travel in the roadmap link as
// base64url-encoded JSON, so they are treated as untrusted on the way in:
// only known ids, only strings, capped in length and number.
export const NOTE_MAX = 140;
const NOTES_LIMIT = 60;
export const cleanNote = s => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_MAX);

export function encodeNotes(notes, ids) {
  const obj = {};
  for (const id of ids) { const t = cleanNote(notes.get(id)); if (t) obj[id] = t; }
  if (!Object.keys(obj).length) return "";
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeNotes(text, ids) {
  const out = new Map();
  if (!text || text.length > 20000) return out;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const obj = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
    const allowed = new Set(ids);
    for (const [id, value] of Object.entries(obj)) {
      if (out.size >= NOTES_LIMIT) break;
      if (!allowed.has(id) || typeof value !== "string") continue;
      const t = cleanNote(value);
      if (t) out.set(id, t);
    }
  } catch { /* malformed link: no notes */ }
  return out;
}
