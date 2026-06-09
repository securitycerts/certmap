// Shared formatting helpers and the level vocabulary. Both the renderers and the
// hover tooltip pulled their own copies of these before; keeping a single source
// here avoids the three slightly-different escapers and price formatters drifting
// apart over time.

export const LEVELS = ["beginner", "intermediate", "advanced", "expert"];
// Matrix rows read top to bottom, most senior first.
export const LEVELS_DISPLAY = ["expert", "advanced", "intermediate", "beginner"];
export const LEVEL_LABEL = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};
export const LEVEL_ORDER = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
// Ballpark study-hour budget per tier, used for the path-planner totals.
export const LEVEL_HOURS = { beginner: 60, intermediate: 140, advanced: 260, expert: 420 };

// Escape the five HTML-significant characters before any string is dropped into
// innerHTML. Everything user-facing that isn't set via textContent goes through this.
export const esc = s =>
  String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Prices are whole US dollars. null means "we don't know", 0 means genuinely free.
export function fmtPrice(n) {
  if (n == null) return "–";
  if (n === 0) return "Free";
  return "$" + n.toLocaleString("en-US");
}

// Turn an ISO date into a short "3 months ago" style label for the verified badge.
export function fmtAgo(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const then = Date.parse(isoDate + "T00:00:00Z");
  if (!Number.isFinite(then)) return "";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return days + " days ago";
  if (days < 365) return Math.round(days / 30) + " months ago";
  return Math.round(days / 365) + " years ago";
}

// Slugify a domain or vendor name for use in the #/... hash routes.
export function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
