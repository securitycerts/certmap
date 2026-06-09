import { loadData } from "./data.js";
import { renderMatrix, renderList, renderDrawer, renderCart, renderFlow, buildFilters, bindState } from "./render.js";
import { slug, fmtPrice, LEVEL_LABEL } from "./format.js";
import { el } from "./dom.js";
import { initTooltip } from "./tooltip.js";

const $ = sel => document.querySelector(sel);
const CART_KEY = "certs-map.cart.v1";
const THEME_KEY = "certs-map.theme";
const VIEW_KEY = "certs-map.view";
const SORT_KEY = "certs-map.sort";

// A cert id is a lowercase slug. We reuse this when reading ids back out of
// localStorage or a shared URL, both of which are attacker-controllable.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const sanitizeIds = arr => arr.filter(x => typeof x === "string" && ID_RE.test(x)).slice(0, 200);

function safeLoadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? sanitizeIds(v) : [];
  } catch { return []; }
}

function persistCart() {
  localStorage.setItem(CART_KEY, JSON.stringify([...state.cart]));
}

const ALLOWED_THEMES = new Set(["dark", "light"]);
const ALLOWED_VIEWS = new Set(["matrix", "list"]);
const ALLOWED_SORTS = new Set(["name", "price_asc", "price_desc", "vendor", "level"]);
function safeLS(key, allowed, fallback) {
  const v = localStorage.getItem(key);
  return allowed.has(v) ? v : fallback;
}

const ROLE_PATHS = {
  "pentester": ["ejpt", "pjpt", "oscp", "pnpt", "osep"],
  "soc-analyst": ["sec-plus", "cysa-plus", "gcih", "splunk-cda", "osda"],
  "cloud-security": ["sec-plus", "ccsk", "aws-scs", "az-500", "ccsp"],
  "grc-manager": ["cisa", "cgrc", "cism", "crisc", "cissp"],
  "dfir-investigator": ["gcfe", "gcfa", "grem", "gnfa", "encase"],
  "red-team-operator": ["oscp", "osep", "crto", "osed", "oswe"],
  "appsec-engineer": ["sec-plus", "csslp", "oswa", "gwapt", "oswe"],
  "threat-intel-analyst": ["sec-plus", "gosi", "gcti", "ctia", "gdat"],
};

// Build the query string for the current filter/search state. Selection ids are
// only included for the explicit "copy link" action so the address bar stays
// clean during normal browsing.
function buildParams({ withSelection = false } = {}) {
  const p = new URLSearchParams();
  const f = state.filters;
  if (f.levels.size) p.set("level", [...f.levels].join(","));
  if (f.domains.size) p.set("domain", [...f.domains].join(","));
  if (f.vendors.size) p.set("vendor", [...f.vendors].join(","));
  if (f.priceMin != null) p.set("pmin", f.priceMin);
  if (f.priceMax != null) p.set("pmax", f.priceMax);
  if (f.freeOnly) p.set("free", "1");
  if (f.dodOnly) p.set("dod", "1");
  if (f.noPrereq) p.set("noprereq", "1");
  if (f.verifiedOnly) p.set("verified", "1");
  if (state.search) p.set("q", state.search);
  if (withSelection && state.cart.size) p.set("sel", [...state.cart].join(","));
  return p;
}

function serializeFilters() {
  const qs = buildParams().toString();
  const next = location.pathname + (qs ? "?" + qs : "") + (location.hash || "");
  if (next !== location.pathname + location.search + location.hash) {
    history.replaceState(null, "", next);
  }
}

function shareUrl() {
  const qs = buildParams({ withSelection: true }).toString();
  return location.origin + location.pathname + (qs ? "?" + qs : "") + (location.hash || "");
}

function deserializeFilters(meta) {
  const p = new URLSearchParams(location.search);
  const inSet = (vals, allowed) => new Set(vals.filter(v => allowed.includes(v)));
  if (p.has("level")) state.filters.levels = inSet(p.get("level").split(","), meta.levels);
  if (p.has("domain")) state.filters.domains = inSet(p.get("domain").split(","), meta.domains);
  if (p.has("vendor")) state.filters.vendors = inSet(p.get("vendor").split(","), meta.vendors);
  if (p.has("pmin")) { const n = Number(p.get("pmin")); if (Number.isFinite(n) && n >= 0) state.filters.priceMin = n; }
  if (p.has("pmax")) { const n = Number(p.get("pmax")); if (Number.isFinite(n) && n >= 0) state.filters.priceMax = n; }
  state.filters.freeOnly = p.get("free") === "1";
  state.filters.dodOnly = p.get("dod") === "1";
  state.filters.noPrereq = p.get("noprereq") === "1";
  state.filters.verifiedOnly = p.get("verified") === "1";
  if (p.has("q")) state.search = String(p.get("q")).slice(0, 200);
  if (p.has("sel")) {
    const ids = sanitizeIds(p.get("sel").split(","));
    if (ids.length) { state.cart = new Set(ids); persistCart(); }
  }
}

const state = {
  search: "",
  sort: safeLS(SORT_KEY, ALLOWED_SORTS, "name"),
  view: safeLS(VIEW_KEY, ALLOWED_VIEWS, "matrix"),
  filters: {
    levels: new Set(),
    domains: new Set(),
    vendors: new Set(),
    priceMin: null,
    priceMax: null,
    freeOnly: false,
    dodOnly: false,
    noPrereq: false,
    verifiedOnly: false,
  },
  cart: new Set(safeLoadCart()),
  toggleCart(id) {
    this.cart.has(id) ? this.cart.delete(id) : this.cart.add(id);
    persistCart();
    updateSelection(id);
  },
};
bindState(state);

let DATA;

function applyFilters(certs) {
  const f = state.filters;
  const q = state.search.trim().toLowerCase();
  return certs.filter(c => {
    if (f.levels.size && !f.levels.has(c.level)) return false;
    if (f.domains.size && !f.domains.has(c.domain)) return false;
    if (f.vendors.size && !f.vendors.has(c.vendor)) return false;
    if (f.freeOnly && !(c.price_usd === 0 || c.price_usd == null)) return false;
    if (f.dodOnly && !c.dod_8140) return false;
    if (f.noPrereq && c.prerequisites.length) return false;
    if (f.verifiedOnly && !c.price_verified_at) return false;
    if (f.priceMin != null && (c.price_usd ?? 0) < f.priceMin) return false;
    if (f.priceMax != null && (c.price_usd ?? 0) > f.priceMax) return false;
    if (q) {
      const hay = (c.id + " " + c.acronym + " " + c.name + " " + c.vendor + " " + c.tags.join(" ") + " " + c.description + " " + c.domain).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function updateSelection(id) {
  const selected = state.cart.has(id);
  document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach(elm => {
    elm.classList.toggle("selected", selected);
    const cb = elm.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = selected;
  });
  const items = DATA.certs.filter(c => state.cart.has(c.id));
  renderCart($("#cart-list"), $("#cart-total"), $("#cart-subtotal"), $("#cart-count"), DATA.certs, state);
  renderFlow($("#flow"), items, DATA.byId);
  const btn = $("#drawer-content").querySelector("[data-toggle-cart]");
  const cmatch = (location.hash || "").match(/^#\/cert\/(.+)$/);
  if (btn && cmatch) btn.textContent = state.cart.has(cmatch[1]) ? "Remove from selection" : "Add to selection";
}

// Build the breadcrumb shown above a filtered domain or vendor list.
function crumbHeading(rootLabel, name, count) {
  return el("span", {},
    el("a", { href: "#/", class: "muted", text: rootLabel }),
    " · ",
    el("strong", { text: name }),
    ` · ${count} certifications`,
  );
}

let frameQueued = false;
// Coalesce bursts of state changes (a preset that adds five certs, a reset that
// clears several filters at once) into a single repaint on the next frame.
function scheduleRender() {
  if (frameQueued) return;
  frameQueued = true;
  requestAnimationFrame(() => { frameQueued = false; rerender(); });
}

// Push the current filter state back into the sidebar controls. Used after a
// filter is removed from the chip row so the checkboxes and inputs stay in sync.
function syncSidebarControls() {
  buildFilters({ levelEl: $("#filter-level"), domainEl: $("#filter-domain"), vendorEl: $("#filter-vendor") }, DATA.meta, state, scheduleRender);
  $("#search").value = state.search;
  $("#price-min").value = state.filters.priceMin ?? "";
  $("#price-max").value = state.filters.priceMax ?? "";
  $("#free-only").checked = state.filters.freeOnly;
  $("#dod-only").checked = state.filters.dodOnly;
  $("#no-prereq").checked = state.filters.noPrereq;
  $("#verified-only").checked = state.filters.verifiedOnly;
}

function removeFilter(kind, value) {
  const f = state.filters;
  if (kind === "level") f.levels.delete(value);
  else if (kind === "domain") f.domains.delete(value);
  else if (kind === "vendor") f.vendors.delete(value);
  else if (kind === "price") { f.priceMin = null; f.priceMax = null; }
  else if (kind === "free") f.freeOnly = false;
  else if (kind === "dod") f.dodOnly = false;
  else if (kind === "noPrereq") f.noPrereq = false;
  else if (kind === "verified") f.verifiedOnly = false;
  else if (kind === "search") state.search = "";
  syncSidebarControls();
  scheduleRender();
}

// The row of removable chips above the results that mirrors what is currently
// filtering the view. Makes the active query visible at a glance, which matters
// most on mobile where the filter sidebar is hidden behind a button.
function renderActiveFilters() {
  const host = $("#active-filters");
  const f = state.filters;
  const chips = [];
  const add = (key, label, kind, value) => {
    const close = el("button", { type: "button", "aria-label": `Remove ${key} ${label}`, text: "×" });
    close.addEventListener("click", () => removeFilter(kind, value));
    chips.push(el("span", { class: "af-chip" },
      el("span", { class: "af-key", text: key }),
      el("span", { text: label }),
      close,
    ));
  };

  if (state.search.trim()) add("search", `"${state.search.trim()}"`, "search");
  for (const l of f.levels) add("level", LEVEL_LABEL[l] || l, "level", l);
  for (const d of f.domains) add("domain", d, "domain", d);
  for (const v of f.vendors) add("vendor", v, "vendor", v);
  if (f.priceMin != null || f.priceMax != null) {
    const lo = f.priceMin != null ? "$" + f.priceMin : "$0";
    const hi = f.priceMax != null ? "$" + f.priceMax : "∞";
    add("price", `${lo}–${hi}`, "price");
  }
  if (f.freeOnly) add("price", "Free / unknown", "free");
  if (f.dodOnly) add("flag", "DoD 8140", "dod");
  if (f.noPrereq) add("flag", "No prerequisites", "noPrereq");
  if (f.verifiedOnly) add("flag", "Verified prices", "verified");

  if (!chips.length) { host.replaceChildren(); host.classList.add("hidden"); return; }
  const clearAll = el("button", { class: "af-clear", type: "button", text: "Clear all" });
  clearAll.addEventListener("click", () => $("#reset-filters").click());
  host.replaceChildren(...chips, clearAll);
  host.classList.remove("hidden");
}

function rerender() {
  const filtered = applyFilters(DATA.certs);
  const grid = $("#grid");
  const hash = location.hash || "#/";

  const dmatch = hash.match(/^#\/domain\/(.+)$/);
  const vmatch = hash.match(/^#\/vendor\/(.+)$/);
  const cmatch = hash.match(/^#\/cert\/(.+)$/);

  if (dmatch) {
    const domain = DATA.meta.domains.find(d => slug(d) === dmatch[1]);
    if (domain) {
      const certs = filtered.filter(c => c.domain === domain);
      renderList(grid, certs, DATA.meta, state, { grouped: false, heading: crumbHeading("← All domains", domain, certs.length) });
    } else { renderMatrix(grid, filtered, DATA.meta, state); }
  } else if (vmatch) {
    const vendor = DATA.meta.vendors.find(v => slug(v) === vmatch[1]);
    if (vendor) {
      const certs = filtered.filter(c => c.vendor === vendor);
      renderList(grid, certs, DATA.meta, state, { grouped: false, heading: crumbHeading("← All vendors", vendor, certs.length) });
    } else { renderMatrix(grid, filtered, DATA.meta, state); }
  } else if (state.search.trim()) {
    const q = state.search.trim();
    const heading = [
      el("span", {}, "Search results for ", el("strong", { text: `"${q}"` })),
      el("span", { class: "muted", text: `${filtered.length} ${filtered.length === 1 ? "match" : "matches"}` }),
    ];
    renderList(grid, filtered, DATA.meta, state, { grouped: false, heading });
  } else if (state.view === "list") {
    renderList(grid, filtered, DATA.meta, state, { grouped: true });
  } else {
    renderMatrix(grid, filtered, DATA.meta, state);
  }

  $("#empty").classList.toggle("hidden", filtered.length > 0);
  $("#result-count").textContent = `${filtered.length} of ${DATA.certs.length} certifications`;
  renderActiveFilters();

  if (cmatch && DATA.byId.has(cmatch[1])) {
    $("#drawer").classList.remove("hidden");
    $("#drawer").setAttribute("aria-hidden", "false");
    renderDrawer($("#drawer-content"), DATA.byId.get(cmatch[1]), DATA.byId);
  } else {
    $("#drawer").classList.add("hidden");
    $("#drawer").setAttribute("aria-hidden", "true");
  }

  renderCart($("#cart-list"), $("#cart-total"), $("#cart-subtotal"), $("#cart-count"), DATA.certs, state);
  renderFlow($("#flow"), DATA.certs.filter(c => state.cart.has(c.id)), DATA.byId);

  document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.view === state.view));
  serializeFilters();
}

function exportMd() {
  const items = DATA.certs.filter(c => state.cart.has(c.id));
  const total = items.reduce((a, c) => a + (c.price_usd || 0), 0);
  const lines = [
    "# My Security Certification Path", "",
    "| Cert | Vendor | Level | Price |", "|------|--------|-------|-------|",
    ...items.map(c => `| [${c.acronym}](${c.url}) | ${c.vendor} | ${c.level} | ${fmtPrice(c.price_usd)} |`),
    "", `**Total: $${total.toLocaleString("en-US")}**`,
  ];
  navigator.clipboard.writeText(lines.join("\n"));
}

function exportCsv() {
  const items = DATA.certs.filter(c => state.cart.has(c.id));
  const rows = [["id", "acronym", "name", "vendor", "domain", "level", "price_usd", "url"]];
  items.forEach(c => rows.push([c.id, c.acronym, c.name, c.vendor, c.domain, c.level, c.price_usd ?? "", c.url]));
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "my-certs.csv"; a.click();
  URL.revokeObjectURL(a.href);
}

// Briefly swap a button's label to confirm a clipboard copy without a toast.
function flashCopied(btn, label = "Copied") {
  const original = btn.textContent;
  btn.textContent = label;
  btn.disabled = true;
  setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1200);
}

async function init() {
  document.documentElement.dataset.theme = safeLS(THEME_KEY, ALLOWED_THEMES, "dark");
  DATA = await loadData();
  initTooltip(DATA);

  deserializeFilters(DATA.meta);
  // Drop any selected id (from storage or a shared link) that no longer exists.
  for (const id of [...state.cart]) if (!DATA.byId.has(id)) state.cart.delete(id);

  buildFilters(
    { levelEl: $("#filter-level"), domainEl: $("#filter-domain"), vendorEl: $("#filter-vendor") },
    DATA.meta, state, scheduleRender
  );

  if (state.search) $("#search").value = state.search;
  if (state.filters.priceMin != null) $("#price-min").value = state.filters.priceMin;
  if (state.filters.priceMax != null) $("#price-max").value = state.filters.priceMax;
  $("#free-only").checked = state.filters.freeOnly;
  $("#dod-only").checked = state.filters.dodOnly;
  $("#no-prereq").checked = state.filters.noPrereq;
  $("#verified-only").checked = state.filters.verifiedOnly;

  const verifiedCount = DATA.certs.filter(c => c.price_verified_at).length;
  $("#freshness").textContent = `${verifiedCount} of ${DATA.certs.length} prices verified against the vendor`;

  const presetEl = $("#preset");
  if (presetEl) presetEl.addEventListener("change", e => {
    const ids = ROLE_PATHS[e.target.value];
    if (!ids) return;
    for (const cid of ids) if (DATA.byId.has(cid)) state.cart.add(cid);
    persistCart();
    e.target.value = "";
    scheduleRender();
  });

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const onSearch = debounce(v => { state.search = v; scheduleRender(); }, 80);
  $("#search").addEventListener("input", e => onSearch(e.target.value));
  $("#search").addEventListener("keydown", e => { if (e.key === "Escape") { e.target.value = ""; state.search = ""; scheduleRender(); } });

  document.addEventListener("keydown", e => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
      e.preventDefault(); $("#search").focus();
    }
    if (e.key === "Escape" && !$("#drawer").classList.contains("hidden")) {
      location.hash = "#/";
    }
  });

  const sortEl = $("#sort"); sortEl.value = state.sort;
  sortEl.addEventListener("change", e => { state.sort = e.target.value; localStorage.setItem(SORT_KEY, state.sort); scheduleRender(); });

  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      localStorage.setItem(VIEW_KEY, state.view);
      scheduleRender();
    });
  });

  $("#price-min").addEventListener("input", e => { state.filters.priceMin = e.target.value ? Number(e.target.value) : null; scheduleRender(); });
  $("#price-max").addEventListener("input", e => { state.filters.priceMax = e.target.value ? Number(e.target.value) : null; scheduleRender(); });
  $("#free-only").addEventListener("change", e => { state.filters.freeOnly = e.target.checked; scheduleRender(); });
  $("#dod-only").addEventListener("change", e => { state.filters.dodOnly = e.target.checked; scheduleRender(); });
  $("#no-prereq").addEventListener("change", e => { state.filters.noPrereq = e.target.checked; scheduleRender(); });
  $("#verified-only").addEventListener("change", e => { state.filters.verifiedOnly = e.target.checked; scheduleRender(); });

  const vendorSearch = $("#filter-vendor-search");
  vendorSearch.addEventListener("input", e => {
    const q = e.target.value.trim().toLowerCase();
    $("#filter-vendor").querySelectorAll("label").forEach(lbl => {
      lbl.style.display = !q || lbl.dataset.vendor.includes(q) ? "" : "none";
    });
  });

  document.querySelectorAll(".filter-clear").forEach(elm => {
    elm.addEventListener("click", () => {
      state.filters[elm.dataset.clear] = new Set();
      buildFilters({ levelEl: $("#filter-level"), domainEl: $("#filter-domain"), vendorEl: $("#filter-vendor") }, DATA.meta, state, scheduleRender);
      scheduleRender();
    });
  });

  $("#reset-filters").addEventListener("click", () => {
    state.search = ""; $("#search").value = "";
    state.filters = { levels: new Set(), domains: new Set(), vendors: new Set(), priceMin: null, priceMax: null, freeOnly: false, dodOnly: false, noPrereq: false, verifiedOnly: false };
    $("#price-min").value = ""; $("#price-max").value = "";
    document.querySelectorAll("#sidebar input[type=checkbox]").forEach(i => i.checked = false);
    buildFilters({ levelEl: $("#filter-level"), domainEl: $("#filter-domain"), vendorEl: $("#filter-vendor") }, DATA.meta, state, scheduleRender);
    scheduleRender();
  });

  $("#theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  });

  // Delegated clicks for the grid: one listener handles every pill and card
  // regardless of how often the matrix repaints. A click on the pick checkbox is
  // left to the change handler below; anything else opens the cert or domain.
  $("#grid").addEventListener("click", e => {
    const colhead = e.target.closest(".mx-colhead");
    if (colhead?.dataset.navDomain) { location.hash = `#/domain/${colhead.dataset.navDomain}`; return; }
    if (e.target.closest(".pill-pick, .lc-pick")) return;
    const card = e.target.closest("[data-id]");
    if (card) location.hash = `#/cert/${card.dataset.id}`;
  });
  $("#grid").addEventListener("change", e => {
    if (e.target.matches(".pill-pick input, .lc-pick input")) {
      const card = e.target.closest("[data-id]");
      if (card) state.toggleCart(card.dataset.id);
    }
  });
  $("#flow").addEventListener("click", e => {
    if (e.target.closest(".flow-head")) return;
    const node = e.target.closest(".flow-node[data-id]");
    if (node) location.hash = `#/cert/${node.dataset.id}`;
  });

  $("#drawer-content").addEventListener("click", e => {
    if (e.target.closest("[data-toggle-cart]")) {
      const cmatch = (location.hash || "").match(/^#\/cert\/(.+)$/);
      if (cmatch) state.toggleCart(cmatch[1]);
    }
  });
  $("#drawer-close").addEventListener("click", () => { location.hash = "#/"; });
  $("#cart-toggle").addEventListener("click", () => $("#cart").classList.toggle("hidden"));
  $("#cart-close").addEventListener("click", () => $("#cart").classList.add("hidden"));
  $("#cart-clear").addEventListener("click", () => { state.cart.clear(); persistCart(); scheduleRender(); });
  $("#cart-md").addEventListener("click", e => { exportMd(); flashCopied(e.currentTarget); });
  $("#cart-csv").addEventListener("click", exportCsv);
  $("#cart-share").addEventListener("click", e => {
    navigator.clipboard.writeText(shareUrl()).then(() => flashCopied(e.currentTarget, "Link copied"));
  });

  window.addEventListener("hashchange", scheduleRender);

  const mql = window.matchMedia("(max-width: 900px)");
  const onMql = () => { if (mql.matches) state.view = "list"; };
  mql.addEventListener?.("change", onMql); onMql();

  const toggleSidebar = open => {
    const sb = $("#sidebar"), bd = $("#backdrop");
    const shouldOpen = open ?? !sb.classList.contains("open");
    sb.classList.toggle("open", shouldOpen);
    bd.classList.toggle("hidden", !shouldOpen);
  };
  $("#mobile-filter").addEventListener("click", () => toggleSidebar(true));
  $("#backdrop").addEventListener("click", () => toggleSidebar(false));

  rerender();
}

init().catch(err => {
  console.error(err);
  const pre = document.createElement("pre");
  pre.className = "load-error";
  pre.textContent = "Failed to load data: " + (err && err.message ? err.message : "unknown error");
  document.body.appendChild(pre);
});
