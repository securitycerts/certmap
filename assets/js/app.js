import { loadData } from "./data.js?v=7fca6d4a";
import { renderMatrix, renderList, renderDrawer, renderCart, renderFlow, renderRoadmap, buildFilters, bindState, bindData, renderAddResults } from "./render.js?v=7fca6d4a";
import { slug, fmtPrice, LEVEL_LABEL } from "./format.js?v=7fca6d4a";
import { el } from "./dom.js?v=7fca6d4a";
import { initTooltip, hideTooltip } from "./tooltip.js?v=7fca6d4a";
import { initContextMenu, closeContextMenu } from "./contextmenu.js?v=7fca6d4a";
import { toast, copyText } from "./toast.js?v=7fca6d4a";
import { staggerIn, pop, drawerIn, drawerOut, panelIn, panelOut, cascade, tweenNumber, spin, logoIntro, motionOK } from "./motion.js?v=7fca6d4a";
import { ROLE_PATHS, encodeNotes, decodeNotes, cleanNote } from "./paths.js?v=7fca6d4a";
import { mountGraph, unmountGraph } from "./graph.js?v=7fca6d4a";
import { downloadRoadmapImage } from "./share-image.js?v=7fca6d4a";

const $ = sel => document.querySelector(sel);
const CART_KEY = "certs-map.cart.v1";
const THEME_KEY = "certs-map.theme";
const VIEW_KEY = "certs-map.view";
const SORT_KEY = "certs-map.sort";
const SIDEBAR_KEY = "certs-map.sidebar";
const NAME_KEY = "certs-map.roadmap-name";
const NAME_MAX = 60;
const NOTES_KEY = "certs-map.notes.v1";
const RM_VIEW_KEY = "certs-map.roadmap-view";
const ALLOWED_RM_VIEWS = new Set(["list", "graph"]);
const THEME_COLOR = { dark: "#0b0d12", light: "#f7f8fa" };

// A cert id is a lowercase slug. We reuse this when reading ids back out of
// localStorage or a shared URL, both of which are attacker-controllable.
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
const sanitizeIds = arr => arr.filter(x => typeof x === "string" && ID_RE.test(x)).slice(0, 200);

// Storage can throw (private mode, blocked site data); the page must still work.
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* not persisted */ } },
};

function safeLoadCart() {
  try {
    const v = JSON.parse(store.get(CART_KEY) || "[]");
    return Array.isArray(v) ? sanitizeIds(v) : [];
  } catch { return []; }
}

function persistCart() {
  store.set(CART_KEY, JSON.stringify([...state.cart]));
}

const ALLOWED_THEMES = new Set(["dark", "light"]);
const ALLOWED_VIEWS = new Set(["matrix", "list"]);
const ALLOWED_SORTS = new Set(["name", "price_asc", "price_desc", "vendor", "level"]);
function safeLS(key, allowed, fallback) {
  const v = store.get(key);
  return allowed.has(v) ? v : fallback;
}


// The boolean filters share one shape: a checkbox in the sidebar, a URL
// parameter, a chip label and a predicate. Adding one is a single row here plus
// the checkbox in index.html.
const FLAGS = [
  { key: "freeOnly", sel: "#free-only", param: "free", chip: "price", label: "Free / unknown", test: c => c.price_usd === 0 || c.price_usd == null },
  { key: "dodOnly", sel: "#dod-only", param: "dod", chip: "flag", label: "DoD 8140", test: c => c.dod_8140 },
  { key: "noPrereq", sel: "#no-prereq", param: "noprereq", chip: "flag", label: "No prerequisites", test: c => !c.prerequisites.length },
  { key: "handsOn", sel: "#hands-on", param: "handson", chip: "flag", label: "Hands-on exam", test: c => c.hands_on },
  { key: "verifiedOnly", sel: "#verified-only", param: "verified", chip: "flag", label: "Verified prices", test: c => !!c.price_verified_at },
];

const emptyFilters = () => ({
  levels: new Set(),
  domains: new Set(),
  vendors: new Set(),
  tags: new Set(),
  priceMin: null,
  priceMax: null,
  ...Object.fromEntries(FLAGS.map(f => [f.key, false])),
});

// Build the query string for the current filter/search state. Selection ids are
// only included for the explicit "copy link" action so the address bar stays
// clean during normal browsing.
function buildParams({ withSelection = false } = {}) {
  const p = new URLSearchParams();
  const f = state.filters;
  if (f.levels.size) p.set("level", [...f.levels].join(","));
  if (f.domains.size) p.set("domain", [...f.domains].join(","));
  if (f.vendors.size) p.set("vendor", [...f.vendors].join(","));
  if (f.tags.size) p.set("tag", [...f.tags].join(","));
  if (f.priceMin != null) p.set("pmin", f.priceMin);
  if (f.priceMax != null) p.set("pmax", f.priceMax);
  for (const flag of FLAGS) if (f[flag.key]) p.set(flag.param, "1");
  if (state.search) p.set("q", state.search);
  if (withSelection && state.cart.size) p.set("sel", [...state.cart].join(","));
  return p;
}

const hasActiveFilters = () => buildParams().toString() !== "";

function serializeFilters() {
  const qs = buildParams().toString();
  const next = location.pathname + (qs ? "?" + qs : "") + (location.hash || "");
  if (next !== location.pathname + location.search + location.hash) {
    history.replaceState(null, "", next);
  }
}

// Link to the current filters and view (not the selection; that is a roadmap).
function shareUrl() {
  const qs = buildParams().toString();
  return location.origin + location.pathname + (qs ? "?" + qs : "") + (location.hash || "");
}

// ---------- shareable roadmaps ----------
// A roadmap lives entirely in the URL: #/roadmap/<id>,<id>,...?name=<title>.
// Opening one shows it as its own page and never touches the visitor's saved
// selection unless they choose "Use as my selection".
const cleanName = s => String(s || "").replace(/\s+/g, " ").trim().slice(0, NAME_MAX);

function roadmapHash(ids, name, notes) {
  const p = new URLSearchParams();
  const title = cleanName(name);
  if (title) p.set("name", title);
  const packed = notes ? encodeNotes(notes, ids) : "";
  if (packed) p.set("notes", packed);
  const qs = p.toString();
  return `#/roadmap/${ids.join(",")}` + (qs ? "?" + qs : "");
}
const myRoadmapHash = () => (state.cart.size ? roadmapHash(selectedCerts().map(c => c.id), state.roadmapName, state.notes) : "#/roadmap/");
// What gets copied when a roadmap is shared. It goes through r/, a small page
// with its own link preview, which forwards to the #/roadmap/ route.
const shareLink = hash => new URL("../../r/", import.meta.url).href + "#" + hash.slice("#/roadmap/".length);
const myRoadmapUrl = () => shareLink(myRoadmapHash());

function loadNotes() {
  try {
    const obj = JSON.parse(store.get(NOTES_KEY) || "{}");
    const out = new Map();
    for (const [id, text] of Object.entries(obj || {})) {
      if (ID_RE.test(id) && typeof text === "string" && cleanNote(text)) out.set(id, cleanNote(text));
    }
    return out;
  } catch { return new Map(); }
}
const persistNotes = () => store.set(NOTES_KEY, JSON.stringify(Object.fromEntries(state.notes)));

function readRoadmap(hash) {
  const m = hash.match(/^#\/roadmap\/([a-z0-9,-]*)(?:\?(.*))?$/);
  if (!m) return null;
  const ids = [...new Set(sanitizeIds(m[1].split(",")))].filter(id => DATA.byId.has(id));
  let name = "", notes = new Map();
  try {
    const p = new URLSearchParams(m[2] || "");
    name = cleanName(p.get("name"));
    notes = decodeNotes(p.get("notes"), ids);
  } catch { /* malformed escape */ }
  const same = ids.length === state.cart.size && ids.every(id => state.cart.has(id));
  return { ids, name, notes, same };
}

const certUrl = id => location.origin + location.pathname + `#/cert/${id}`;

function deserializeFilters(meta) {
  const p = new URLSearchParams(location.search);
  const inSet = (vals, allowed) => new Set(vals.filter(v => allowed.includes(v)));
  if (p.has("level")) state.filters.levels = inSet(p.get("level").split(","), meta.levels);
  if (p.has("domain")) state.filters.domains = inSet(p.get("domain").split(","), meta.domains);
  if (p.has("vendor")) state.filters.vendors = inSet(p.get("vendor").split(","), meta.vendors);
  if (p.has("tag")) state.filters.tags = inSet(p.get("tag").split(","), meta.tags);
  if (p.has("pmin")) { const n = Number(p.get("pmin")); if (Number.isFinite(n) && n >= 0) state.filters.priceMin = n; }
  if (p.has("pmax")) { const n = Number(p.get("pmax")); if (Number.isFinite(n) && n >= 0) state.filters.priceMax = n; }
  for (const flag of FLAGS) state.filters[flag.key] = p.get(flag.param) === "1";
  if (p.has("q")) state.search = String(p.get("q")).slice(0, 200);
  // Links from before roadmaps existed carried the selection as ?sel=. Open
  // them as a roadmap instead of overwriting the visitor's own selection.
  if (p.has("sel")) {
    const ids = sanitizeIds(p.get("sel").split(","));
    if (ids.length) history.replaceState(null, "", location.pathname + roadmapHash(ids, ""));
  }
}

const state = {
  search: "",
  sort: safeLS(SORT_KEY, ALLOWED_SORTS, "name"),
  view: safeLS(VIEW_KEY, ALLOWED_VIEWS, "matrix"),
  filters: emptyFilters(),
  cart: new Set(safeLoadCart()),
  roadmapName: cleanName(store.get(NAME_KEY)),
  roadmapView: safeLS(RM_VIEW_KEY, ALLOWED_RM_VIEWS, "graph"),
  notes: loadNotes(),
  toggleCart(id) {
    // On your own roadmap page the page is the selection, so a change has to
    // repaint it: the address follows the selection and the route does the rest.
    const onMine = !!readRoadmap(baseHash)?.same;
    this.cart.has(id) ? this.cart.delete(id) : this.cart.add(id);
    persistCart();
    updateSelection(id);
    if (onMine) location.hash = myRoadmapHash();
  },
};
bindState(state);

let DATA;
// Lower-cased search text per cert, built once after the data loads.
const HAYSTACK = new Map();

function applyFilters(certs) {
  const f = state.filters;
  // Every word has to match, in any order: "giac cloud" finds GCLD and GPCS.
  const terms = state.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const flags = FLAGS.filter(flag => f[flag.key]);
  const tags = [...f.tags];
  return certs.filter(c => {
    if (f.levels.size && !f.levels.has(c.level)) return false;
    if (f.domains.size && !f.domains.has(c.domain)) return false;
    if (f.vendors.size && !f.vendors.has(c.vendor)) return false;
    if (tags.length && !tags.every(t => c.tags.includes(t))) return false;
    if (!flags.every(flag => flag.test(c))) return false;
    if (f.priceMin != null && (c.price_usd ?? 0) < f.priceMin) return false;
    if (f.priceMax != null && (c.price_usd ?? 0) > f.priceMax) return false;
    if (terms.length) {
      const hay = HAYSTACK.get(c.id);
      if (!terms.every(t => hay.includes(t))) return false;
    }
    return true;
  });
}

// ---------- routing ----------
// The drawer is an overlay on top of whatever list was showing. `baseHash`
// remembers that list so opening a cert from a domain or vendor page keeps the
// page underneath, and closing the drawer returns to it rather than to home.
let baseHash = "#/";
function readRoute() {
  const hash = location.hash || "#/";
  const cert = hash.match(/^#\/cert\/([a-z0-9-]+)$/);
  if (cert) return cert[1];
  baseHash = hash;
  return null;
}
const openCert = id => { location.hash = `#/cert/${id}`; };
const closeDrawer = () => { location.hash = baseHash; };

// ---------- selection ----------
function paintCart() {
  const sum = renderCart($("#cart-list"), $("#cart-count"), DATA.certs, state);
  const paint = n => {
    const text = "$" + n.toLocaleString("en-US");
    $("#cart-total").textContent = text;
    $("#cart-subtotal").textContent = text;
  };
  tweenNumber($("#cart-total"), sum, paint);
  const empty = state.cart.size === 0;
  for (const id of ["#cart-md", "#cart-share", "#cart-csv", "#cart-clear"]) $(id).disabled = empty;
  // With nothing selected the panel shows only the empty message: a row of
  // greyed-out buttons says nothing useful.
  $("#cart").classList.toggle("is-empty", empty);
}

let flowIds = new Set();
function paintFlow() {
  const items = DATA.certs.filter(c => state.cart.has(c.id));
  renderFlow($("#flow"), items, DATA.byId);
  const fresh = [...$("#flow").querySelectorAll(".flow-node")].filter(n => !flowIds.has(n.dataset.id));
  if (flowIds.size) staggerIn(fresh, { y: 8 });
  flowIds = new Set(items.map(c => c.id));
}

function paintDrawerToggle() {
  const btn = $("#drawer-content").querySelector("[data-toggle-cart]");
  if (btn && drawerCert) btn.textContent = state.cart.has(drawerCert) ? "Remove from selection" : "Add to selection";
}

// In-place update after a single cert is toggled: no grid repaint needed.
function updateSelection(id) {
  const selected = state.cart.has(id);
  // Graph nodes are excluded: React Flow owns their "selected" class.
  const cards = document.querySelectorAll(`[data-id="${CSS.escape(id)}"]:not(.react-flow__node)`);
  cards.forEach(elm => {
    elm.classList.toggle("selected", selected);
    const cb = elm.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = selected;
  });
  pop($("#grid").querySelectorAll(`[data-id="${CSS.escape(id)}"]:not(.react-flow__node)`));
  pop($("#cart-toggle"), 1.05);
  paintCart();
  paintFlow();
  paintDrawerToggle();
  lastGridKey = gridKey();
}

// Everything a cert needs first, transitively, in dependency order.
function prerequisiteClosure(id, seen = new Set()) {
  for (const p of DATA.byId.get(id)?.prerequisites || []) {
    if (seen.has(p) || !DATA.byId.has(p)) continue;
    prerequisiteClosure(p, seen);
    seen.add(p);
  }
  return seen;
}

function addMany(ids, message) {
  const fresh = ids.filter(id => DATA.byId.has(id) && !state.cart.has(id));
  for (const id of fresh) state.cart.add(id);
  persistCart();
  scheduleRender();
  toast(message(fresh.length));
}

// ---------- rendering ----------
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

function applyVendorSearch() {
  const q = $("#filter-vendor-search").value.trim().toLowerCase();
  $("#filter-vendor").querySelectorAll("label").forEach(lbl => {
    lbl.classList.toggle("hidden", !!q && !lbl.dataset.vendor.includes(q));
  });
}

function paintFilters() {
  buildFilters({ levelEl: $("#filter-level"), domainEl: $("#filter-domain"), vendorEl: $("#filter-vendor") }, DATA.meta, state, scheduleRender);
  applyVendorSearch();
}

// Push the current filter state back into the sidebar controls. Used whenever
// the state is changed from somewhere other than the sidebar itself.
function syncSidebarControls() {
  paintFilters();
  $("#search").value = state.search;
  $("#price-min").value = state.filters.priceMin ?? "";
  $("#price-max").value = state.filters.priceMax ?? "";
  for (const flag of FLAGS) $(flag.sel).checked = state.filters[flag.key];
}

function resetFilters() {
  state.search = "";
  state.filters = emptyFilters();
  syncSidebarControls();
  scheduleRender();
}

function removeFilter(kind, value) {
  const f = state.filters;
  if (kind === "level") f.levels.delete(value);
  else if (kind === "domain") f.domains.delete(value);
  else if (kind === "vendor") f.vendors.delete(value);
  else if (kind === "tag") f.tags.delete(value);
  else if (kind === "price") { f.priceMin = null; f.priceMax = null; }
  else if (kind === "flag") f[value] = false;
  else if (kind === "search") state.search = "";
  syncSidebarControls();
  scheduleRender();
}

// Show every certification that carries a tag: clear the other filters so the
// result is not silently narrowed, and go back to the full grid.
function showTag(tag) {
  state.search = "";
  state.filters = emptyFilters();
  state.filters.tags = new Set([tag]);
  syncSidebarControls();
  if (location.hash && location.hash !== "#/") location.hash = "#/";
  scheduleRender();
}

// Narrow one of the set filters to a single value, or lift it if it is already
// narrowed to exactly that value. Used by the right-click menu.
function toggleOnly(kind, value) {
  const set = state.filters[kind];
  const isOnly = set.size === 1 && set.has(value);
  state.filters[kind] = isOnly ? new Set() : new Set([value]);
  syncSidebarControls();
  scheduleRender();
}
const isOnly = (kind, value) => state.filters[kind].size === 1 && state.filters[kind].has(value);

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
  for (const t of f.tags) add("tag", t, "tag", t);
  if (f.priceMin != null || f.priceMax != null) {
    const lo = f.priceMin != null ? "$" + f.priceMin : "$0";
    const hi = f.priceMax != null ? "$" + f.priceMax : "∞";
    add("price", `${lo}–${hi}`, "price");
  }
  for (const flag of FLAGS) if (f[flag.key]) add(flag.chip, flag.label, "flag", flag.key);

  if (!chips.length) { host.replaceChildren(); host.classList.add("hidden"); return; }
  const clearAll = el("button", { class: "af-clear", type: "button", text: "Clear all" });
  clearAll.addEventListener("click", resetFilters);
  host.replaceChildren(...chips, clearAll);
  host.classList.remove("hidden");
}

// What the grid depends on. If none of it changed (the user only opened or
// closed a cert) the grid is left alone, which keeps scroll position and focus.
const gridKey = () => [baseHash, state.view, state.sort, state.roadmapView, currentTheme(), buildParams({ withSelection: true }).toString()].join("|");
let lastGridKey = null;
let lastScene = null;
let shownRoadmap = null;

// Notes are edited in place (list or graph), so they never trigger a repaint.
// While you are looking at your own roadmap the address bar is kept in step,
// so copying the URL always includes what you just typed.
function setNote(id, text) {
  const note = cleanNote(text);
  note ? state.notes.set(id, note) : state.notes.delete(id);
  persistNotes();
  if (readRoadmap(baseHash)?.same) {
    baseHash = myRoadmapHash();
    history.replaceState(null, "", location.pathname + location.search + baseHash);
    lastGridKey = gridKey();
  }
}

// The roadmap name can be typed in the selection panel or on the roadmap page
// itself. Either way it is stored at once, the other field follows, and a
// short "Saved" confirms it, since nothing else on screen changes.
let savedTimer;
function setRoadmapName(value, source) {
  state.roadmapName = cleanName(value);
  store.set(NAME_KEY, state.roadmapName);
  for (const sel of ["#cart-name", "#rm-name"]) {
    const field = $(sel);
    if (field && field !== source) field.value = state.roadmapName;
  }
  if (readRoadmap(baseHash)?.same) {
    baseHash = myRoadmapHash();
    history.replaceState(null, "", location.pathname + location.search + baseHash);
    lastGridKey = gridKey();
    document.title = `${state.roadmapName || "Roadmap"} · cert/map`;
  }
  for (const sel of ["#cart-saved", "#rm-saved"]) {
    const flag = $(sel);
    if (!flag) continue;
    flag.textContent = "Saved ✓";
    flag.classList.add("on");
  }
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    $("#cart-saved")?.classList.remove("on");
    const line = $("#rm-saved");
    if (line) { line.classList.remove("on"); line.textContent = "Saved in this browser. The link updates as you edit."; }
  }, 1600);
}

function setRoadmapView(view) {
  if (!ALLOWED_RM_VIEWS.has(view) || view === state.roadmapView) return;
  state.roadmapView = view;
  store.set(RM_VIEW_KEY, view);
  scheduleRender();
}

function paintGrid(filtered) {
  const grid = $("#grid");
  const dmatch = baseHash.match(/^#\/domain\/(.+)$/);
  const vmatch = baseHash.match(/^#\/vendor\/(.+)$/);
  const domain = dmatch && DATA.meta.domains.find(d => slug(d) === dmatch[1]);
  const vendor = vmatch && DATA.meta.vendors.find(v => slug(v) === vmatch[1]);
  const roadmap = readRoadmap(baseHash);
  let scene;

  unmountGraph();
  if (roadmap) {
    // Your own roadmap shows your live notes; someone else's shows the notes
    // that came with the link.
    const notes = roadmap.same ? state.notes : roadmap.notes;
    const { ordered, graphHost } = renderRoadmap(grid, roadmap.ids.map(id => DATA.byId.get(id)), state, {
      name: roadmap.name, same: roadmap.same, view: state.roadmapView, notes,
    });
    shownRoadmap = { ordered, name: roadmap.name };
    if (graphHost) {
      mountGraph(graphHost, {
        certs: ordered, notes, editable: roadmap.same, theme: currentTheme(),
        onOpen: openCert, onNote: setNote, onRemove: id => state.toggleCart(id),
      });
    }
    scene = "roadmap:" + state.roadmapView;
    if (refocusAdd) { refocusAdd = false; $("#rm-add")?.focus({ preventScroll: true }); }
  } else if (domain) {
    const certs = filtered.filter(c => c.domain === domain);
    renderList(grid, certs, DATA.meta, state, { grouped: false, heading: crumbHeading("← All domains", domain, certs.length) });
    scene = "domain:" + domain;
  } else if (vendor) {
    const certs = filtered.filter(c => c.vendor === vendor);
    renderList(grid, certs, DATA.meta, state, { grouped: false, heading: crumbHeading("← All vendors", vendor, certs.length) });
    scene = "vendor:" + vendor;
  } else if (state.search.trim()) {
    const q = state.search.trim();
    const heading = [
      el("span", {}, "Search results for ", el("strong", { text: `"${q}"` })),
      el("span", { class: "muted", text: `${filtered.length} ${filtered.length === 1 ? "match" : "matches"}` }),
    ];
    renderList(grid, filtered, DATA.meta, state, { grouped: false, heading });
    scene = "search";
  } else if (state.view === "list") {
    renderList(grid, filtered, DATA.meta, state, { grouped: true });
    scene = "list";
  } else {
    renderMatrix(grid, filtered, DATA.meta, state);
    scene = "matrix";
  }

  // Animate only when the kind of view changes; filtering within a view stays
  // instant so typing in the search box never flickers.
  if (scene !== lastScene) {
    staggerIn(grid.querySelectorAll(".pill, .list-card"));
    $("#content").scrollTop = 0;
  }
  lastScene = scene;
}

// ---------- drawer ----------
let drawerCert = null;

function drawerNeighbours() {
  const ids = [...new Set([...$("#grid").querySelectorAll("[data-id]")].map(n => n.dataset.id))];
  const at = ids.indexOf(drawerCert);
  return { prev: at > 0 ? ids[at - 1] : null, next: at >= 0 && at < ids.length - 1 ? ids[at + 1] : null };
}

function stepCert(delta) {
  if (!drawerCert) return;
  const { prev, next } = drawerNeighbours();
  const id = delta < 0 ? prev : next;
  if (id) openCert(id);
}

function syncDrawer(certId) {
  const drawer = $("#drawer");
  if (certId && DATA.byId.has(certId)) {
    const wasClosed = drawer.classList.contains("hidden");
    if (drawerCert !== certId) {
      drawerCert = certId;
      renderDrawer($("#drawer-content"), DATA.byId.get(certId), DATA.byId);
      cascade($("#drawer-content"));
    }
    drawerIn(drawer);
    if (wasClosed) $("#drawer-close").focus({ preventScroll: true });
    const { prev, next } = drawerNeighbours();
    $("#drawer-prev").disabled = !prev;
    $("#drawer-next").disabled = !next;
  } else if (drawerCert) {
    const id = drawerCert;
    drawerCert = null;
    const hadFocus = drawer.contains(document.activeElement);
    drawerOut(drawer);
    // Hand focus back to the card the drawer was opened from.
    if (hadFocus) $("#grid").querySelector(`[data-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }
}
const BASE_TITLE = document.title;
const drawerTitle = id => (id && DATA.byId.has(id) ? `${DATA.byId.get(id).acronym} · cert/map` : "");

function rerender() {
  const certId = readRoute();
  const filtered = applyFilters(DATA.certs);

  const key = gridKey();
  if (key !== lastGridKey) {
    paintGrid(filtered);
    lastGridKey = key;
  }

  const roadmap = readRoadmap(baseHash);
  $("#empty").classList.toggle("hidden", !!roadmap || filtered.length > 0);
  document.title = drawerTitle(certId) || (roadmap ? `${roadmap.name || "Roadmap"} · cert/map` : BASE_TITLE);
  $("#result-count").textContent = `${filtered.length} of ${DATA.certs.length} certifications`;
  $("#reset-filters").disabled = !hasActiveFilters();
  // The minimised sidebar still says how many filters are on and can clear them.
  const f = state.filters;
  const active = f.levels.size + f.domains.size + f.vendors.size + f.tags.size
    + (f.priceMin != null || f.priceMax != null ? 1 : 0)
    + FLAGS.filter(flag => f[flag.key]).length + (state.search.trim() ? 1 : 0);
  $("#rail-count").textContent = String(active);
  $("#rail-count").classList.toggle("hidden", active === 0);
  $("#rail-reset").disabled = active === 0;
  renderActiveFilters();
  syncDrawer(certId);
  paintCart();
  paintFlow();

  document.querySelectorAll(".seg-btn").forEach(b => {
    const on = b.dataset.view === state.view;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", String(on));
  });
  serializeFilters();
}

// ---------- actions ----------
function setView(view) {
  if (!ALLOWED_VIEWS.has(view)) return;
  state.view = view;
  store.set(VIEW_KEY, view);
  scheduleRender();
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  store.set(THEME_KEY, theme);
  $('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}
const currentTheme = () => document.documentElement.dataset.theme;
// Switching theme repaints every colour on the page at once, which reads as a
// flash. Where the browser supports view transitions the new theme grows out of
// the toggle button as a circle; elsewhere the colours cross-fade. With reduced
// motion the switch stays instant.
function toggleTheme() {
  const root = document.documentElement;
  const apply = () => { setTheme(currentTheme() === "dark" ? "light" : "dark"); scheduleRender(); };
  spin($("#theme-toggle svg"));
  if (!motionOK()) { apply(); return; }

  if (document.startViewTransition && !document.hidden) {
    const r = $("#theme-toggle").getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    root.style.setProperty("--theme-x", x + "px");
    root.style.setProperty("--theme-y", y + "px");
    root.style.setProperty("--theme-r", Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + "px");
    root.classList.add("theme-switching");
    // The browser may skip the animation (tab in the background, another
    // transition running); the theme is applied either way.
    const transition = document.startViewTransition(apply);
    transition.ready.catch(() => {});
    transition.finished.catch(() => {}).then(() => root.classList.remove("theme-switching"));
    return;
  }

  root.classList.add("theme-fade");
  apply();
  setTimeout(() => root.classList.remove("theme-fade"), 450);
}

function setCartOpen(open) {
  const cart = $("#cart");
  const shouldOpen = open ?? cart.classList.contains("hidden");
  shouldOpen ? panelIn(cart) : panelOut(cart);
  $("#cart-toggle").setAttribute("aria-expanded", String(shouldOpen));
}

// The sidebar is a slide-over on narrow screens and a collapsible column on
// wide ones. Only the wide-screen choice is remembered between visits.
const narrow = window.matchMedia("(max-width: 900px)");
function sidebarIsOpen() {
  return narrow.matches ? $("#sidebar").classList.contains("open") : !$(".layout").classList.contains("no-sidebar");
}
function setSidebarOpen(open) {
  const shouldOpen = open ?? !sidebarIsOpen();
  if (narrow.matches) {
    $("#sidebar").classList.toggle("open", shouldOpen);
    $("#backdrop").classList.toggle("hidden", !shouldOpen);
  } else {
    $(".layout").classList.toggle("no-sidebar", !shouldOpen);
    store.set(SIDEBAR_KEY, shouldOpen ? "1" : "0");
  }
  $("#sidebar-toggle").setAttribute("aria-expanded", String(shouldOpen));
  if (!shouldOpen && $("#sidebar").contains(document.activeElement)) $("#sidebar-toggle").focus();
}

function openHelp() {
  const dlg = $("#help");
  if (dlg.open) return;
  dlg.showModal();
  cascade(dlg.querySelector(".help-list"), { step: 16 });
}

function selectedCerts() {
  return DATA.certs.filter(c => state.cart.has(c.id));
}

function exportMd() {
  const items = selectedCerts();
  const total = items.reduce((a, c) => a + (c.price_usd || 0), 0);
  const lines = [
    "# My Security Certification Path", "",
    "| Cert | Vendor | Level | Price |", "|------|--------|-------|-------|",
    ...items.map(c => `| [${c.acronym}](${c.url}) | ${c.vendor} | ${c.level} | ${fmtPrice(c.price_usd)} |`),
    "", `**Total: $${total.toLocaleString("en-US")}**`,
  ];
  return copyText(lines.join("\n"), "Selection copied as Markdown");
}

function exportCsv() {
  const rows = [["id", "acronym", "name", "vendor", "domain", "level", "price_usd", "url"]];
  selectedCerts().forEach(c => rows.push([c.id, c.acronym, c.name, c.vendor, c.domain, c.level, c.price_usd ?? "", c.url]));
  const csv = rows.map(r => r.map(v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = "my-certs.csv"; a.click();
  URL.revokeObjectURL(a.href);
  toast("Exported my-certs.csv");
}

// Your roadmap page. With nothing selected yet it opens as an empty builder.
function viewMyRoadmap() {
  setCartOpen(false);
  const already = location.hash === myRoadmapHash();
  if (state.roadmapView !== "graph") { state.roadmapView = "graph"; store.set(RM_VIEW_KEY, "graph"); }
  if (already) scheduleRender(); else location.hash = myRoadmapHash();
  toast(state.cart.size ? "Your roadmap, as a graph" : "Your roadmap is empty: add a first certification");
  $("#content").scrollTop = 0;
}

// Send a cert to your roadmap and go there: the one-step way from the matrix,
// the list, the drawer or the right-click menu.
function addToRoadmap(id, { focusAdd = false } = {}) {
  if (!DATA.byId.has(id)) return;
  if (!state.cart.has(id)) { state.cart.add(id); persistCart(); toast(`${DATA.byId.get(id).acronym} added to your roadmap`); }
  refocusAdd = focusAdd;
  setCartOpen(false);
  if (location.hash === myRoadmapHash()) scheduleRender(); else location.hash = myRoadmapHash();
}
let refocusAdd = false;

function searchToAdd(query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const host = $("#rm-add-results");
  if (!host) return [];
  const hits = terms.length
    ? DATA.certs.filter(c => !state.cart.has(c.id) && terms.every(t => HAYSTACK.get(c.id).includes(t)))
      .sort((a, b) => (b.acronym.toLowerCase().startsWith(terms[0]) - a.acronym.toLowerCase().startsWith(terms[0])) || a.acronym.localeCompare(b.acronym))
      .slice(0, 8)
    : [];
  renderAddResults(host, hits);
  return hits;
}

// Replace the visitor's selection with the roadmap they are looking at.
function adoptRoadmap() {
  const roadmap = readRoadmap(baseHash);
  if (!roadmap?.ids.length) return;
  state.cart = new Set(roadmap.ids);
  persistCart();
  for (const [id, text] of roadmap.notes) state.notes.set(id, text);
  persistNotes();
  if (roadmap.name) { state.roadmapName = roadmap.name; store.set(NAME_KEY, roadmap.name); $("#cart-name").value = roadmap.name; }
  scheduleRender();
  toast(`Selection replaced with ${roadmap.ids.length} certifications`);
}

function clearSelection() {
  if (!state.cart.size) return;
  const before = [...state.cart];
  state.cart.clear();
  persistCart();
  scheduleRender();
  toast(`Cleared ${before.length} ${before.length === 1 ? "certification" : "certifications"}`);
}

// ---------- right-click menu ----------
function certMenu(c) {
  const selected = state.cart.has(c.id);
  const missing = [...prerequisiteClosure(c.id)].filter(id => !state.cart.has(id));
  return [
    { heading: `${c.acronym} · ${c.vendor}` },
    drawerCert === c.id ? null : { label: "Open details", hint: "Enter", action: () => openCert(c.id) },
    { label: selected ? "Remove from selection" : "Add to selection", hint: "Space", action: () => state.toggleCart(c.id) },
    { label: selected ? "Open my roadmap" : "Add and open my roadmap", action: () => addToRoadmap(c.id) },
    missing.length ? {
      label: `Add with prerequisites (${missing.length + (selected ? 0 : 1)})`,
      action: () => addMany([...missing, c.id], n => `Added ${n} to your path`),
    } : null,
    { label: "Open official page ↗", action: () => window.open(c.url, "_blank", "noopener,noreferrer") },
    { separator: true },
    { label: "Copy link", action: () => copyText(certUrl(c.id), "Link copied") },
    { label: "Copy name", action: () => copyText(`${c.acronym} (${c.name})`, "Name copied") },
    { label: "Copy as Markdown", action: () => copyText(`[${c.acronym}](${c.url})`, "Markdown copied") },
    { separator: true },
    { label: `Only ${c.vendor}`, checked: isOnly("vendors", c.vendor), action: () => toggleOnly("vendors", c.vendor) },
    { label: `Only ${c.domain}`, checked: isOnly("domains", c.domain), action: () => toggleOnly("domains", c.domain) },
    { label: `Only ${LEVEL_LABEL[c.level]} level`, checked: isOnly("levels", c.level), action: () => toggleOnly("levels", c.level) },
  ];
}

function domainMenu(domain) {
  const count = DATA.meta.domainCount.get(domain) || 0;
  return [
    { heading: `${domain} · ${count}` },
    { label: "Open domain", hint: "Enter", action: () => { location.hash = `#/domain/${slug(domain)}`; } },
    { label: "Only this domain", checked: isOnly("domains", domain), action: () => toggleOnly("domains", domain) },
    { label: "Copy link", action: () => copyText(location.origin + location.pathname + `#/domain/${slug(domain)}`, "Link copied") },
  ];
}

function pageMenu() {
  const n = state.cart.size;
  return [
    { heading: "View" },
    { label: "Matrix", hint: "M", checked: state.view === "matrix", action: () => setView("matrix") },
    { label: "List", hint: "L", checked: state.view === "list", action: () => setView("list") },
    { separator: true },
    { label: currentTheme() === "dark" ? "Light theme" : "Dark theme", hint: "T", action: toggleTheme },
    { label: sidebarIsOpen() ? "Hide filters" : "Show filters", hint: "F", action: () => setSidebarOpen() },
    { label: "Reset filters", hint: "R", disabled: !hasActiveFilters(), action: resetFilters },
    { separator: true },
    { label: "Copy link to this view", action: () => copyText(shareUrl(), "Link copied") },
    { label: n ? `Open selection (${n})` : "Open selection", hint: "S", action: () => setCartOpen(true) },
    { label: "My roadmap", hint: "G", action: viewMyRoadmap },
    { label: "Keyboard shortcuts", hint: "?", action: openHelp },
  ];
}

function selectionMenu() {
  const empty = state.cart.size === 0;
  return [
    { heading: `Selection · ${state.cart.size}` },
    { label: "Copy as Markdown", disabled: empty, action: exportMd },
    { label: "View as roadmap", disabled: empty, action: viewMyRoadmap },
    { label: "Copy roadmap link", disabled: empty, action: () => copyText(myRoadmapUrl(), "Roadmap link copied") },
    { label: "Export CSV", disabled: empty, action: exportCsv },
    { separator: true },
    { label: "Clear selection", danger: true, disabled: empty, action: clearSelection },
  ];
}

// Decide which menu a right-click gets. Returning null hands the event back to
// the browser: form fields, plain links and selected text keep the native menu.
function resolveMenu(target) {
  if (!(target instanceof Element) || !DATA) return null;
  if (target.closest("input, textarea, select, dialog")) return null;
  if (String(window.getSelection?.() || "").trim()) return null;
  hideTooltip();

  const card = target.closest("[data-id], [data-ctx-id]");
  const id = card?.dataset.id || card?.dataset.ctxId;
  if (id && DATA.byId.has(id)) return certMenu(DATA.byId.get(id));
  if (target.closest("a[href]")) return null;

  const colhead = target.closest(".mx-colhead");
  if (colhead) {
    const domain = DATA.meta.domains.find(d => slug(d) === colhead.dataset.navDomain);
    if (domain) return domainMenu(domain);
  }
  if (target.closest("#drawer") && drawerCert) return certMenu(DATA.byId.get(drawerCert));
  if (target.closest("#cart")) return selectionMenu();
  if (target.closest("#content")) return pageMenu();
  return null;
}

// ---------- keyboard ----------
const isTyping = node => !!node?.closest?.("input, textarea, select, [contenteditable]");

function onGlobalKey(e) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if ($("#help").open) return;

  if (e.key === "Escape") {
    if (drawerCert) closeDrawer();
    else if (!$("#cart").classList.contains("hidden")) setCartOpen(false);
    else if (narrow.matches && sidebarIsOpen()) setSidebarOpen(false);
    return;
  }
  if (isTyping(e.target)) return;

  const actions = {
    "/": () => $("#search").focus(),
    "?": openHelp,
    m: () => setView("matrix"),
    l: () => setView("list"),
    t: toggleTheme,
    s: () => setCartOpen(),
    f: () => setSidebarOpen(),
    g: viewMyRoadmap,
    r: resetFilters,
    j: () => stepCert(1),
    k: () => stepCert(-1),
  };
  const fn = actions[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (!fn) return;
  e.preventDefault();
  fn();
}

async function init() {
  setTheme(safeLS(THEME_KEY, ALLOWED_THEMES, "dark"));
  DATA = await loadData();
  bindData(DATA);
  for (const c of DATA.certs) {
    HAYSTACK.set(c.id, [c.id, c.acronym, c.name, c.vendor, c.tags.join(" "), c.description, c.domain, c.level].join(" ").toLowerCase());
  }
  initTooltip(DATA);
  initContextMenu(resolveMenu);

  deserializeFilters(DATA.meta);
  // Drop any selected id (from storage or a shared link) that no longer exists.
  for (const id of [...state.cart]) if (!DATA.byId.has(id)) state.cart.delete(id);
  syncSidebarControls();

  const verifiedCount = DATA.certs.filter(c => c.price_verified_at).length;
  $("#freshness").textContent = `${verifiedCount} of ${DATA.certs.length} prices verified against the vendor`;

  $("#preset").addEventListener("change", e => {
    const ids = ROLE_PATHS.find(p => p.id === e.target.value)?.certs;
    const label = e.target.selectedOptions[0]?.textContent || "preset";
    e.target.value = "";
    if (!ids) return;
    addMany(ids, n => n ? `Added ${n} from the ${label.toLowerCase()} path` : `The ${label.toLowerCase()} path is already selected`);
  });

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const onSearch = debounce(v => { state.search = v; scheduleRender(); }, 80);
  $("#search").addEventListener("input", e => onSearch(e.target.value));
  $("#search").addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    e.stopPropagation();
    if (e.target.value) { e.target.value = ""; state.search = ""; scheduleRender(); }
    else e.target.blur();
  });

  document.addEventListener("keydown", onGlobalKey);

  const sortEl = $("#sort"); sortEl.value = state.sort;
  sortEl.addEventListener("change", e => { state.sort = e.target.value; store.set(SORT_KEY, state.sort); scheduleRender(); });

  document.querySelectorAll(".seg-btn").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));

  const priceInput = key => e => {
    const n = e.target.value === "" ? null : Number(e.target.value);
    state.filters[key] = Number.isFinite(n) && n >= 0 ? n : null;
    scheduleRender();
  };
  $("#price-min").addEventListener("input", priceInput("priceMin"));
  $("#price-max").addEventListener("input", priceInput("priceMax"));
  for (const flag of FLAGS) {
    $(flag.sel).addEventListener("change", e => { state.filters[flag.key] = e.target.checked; scheduleRender(); });
  }

  $("#filter-vendor-search").addEventListener("input", applyVendorSearch);

  document.querySelectorAll(".filter-clear").forEach(elm => {
    elm.addEventListener("click", () => {
      state.filters[elm.dataset.clear] = new Set();
      paintFilters();
      scheduleRender();
    });
  });

  $("#reset-filters").addEventListener("click", resetFilters);
  $("#empty-reset").addEventListener("click", resetFilters);
  $("#theme-toggle").addEventListener("click", toggleTheme);
  $("#help-toggle").addEventListener("click", openHelp);
  $("#help").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $("#help-close").addEventListener("click", () => $("#help").close());

  // Delegated handlers for the grid: one listener serves every pill and card
  // regardless of how often the matrix repaints. A click on the pick checkbox is
  // left to the change handler; anything else opens the cert or the domain.
  const grid = $("#grid");
  grid.addEventListener("click", e => {
    // React Flow puts data-id on its nodes. Without this guard every click on
    // a graph step, including one meant for its note field, opened the drawer.
    if (e.target.closest(".react-flow")) return;
    const add = e.target.closest("[data-add-id]");
    if (add) { addToRoadmap(add.dataset.addId, { focusAdd: true }); return; }
    if (e.target.closest(".rm-add, .rm-name")) return;
    const rm = e.target.closest("[data-rm]")?.dataset.rm;
    if (rm === "adopt") { adoptRoadmap(); return; }
    if (rm === "copy") { copyText(shareLink(baseHash), "Roadmap link copied"); return; }
    if (rm === "view-list" || rm === "view-graph") { setRoadmapView(rm.slice(5)); return; }
    if (rm === "image" && shownRoadmap) {
      downloadRoadmapImage(shownRoadmap.ordered, shownRoadmap.name).then(ok => toast(ok ? "Image saved" : "Could not create the image", ok ? {} : { tone: "warn" }));
      return;
    }
    if (e.target.closest(".rm-note-input")) return;
    const colhead = e.target.closest(".mx-colhead");
    if (colhead?.dataset.navDomain) { location.hash = `#/domain/${colhead.dataset.navDomain}`; return; }
    if (e.target.closest(".pill-pick, .lc-pick")) return;
    const card = e.target.closest("[data-id]");
    if (card) openCert(card.dataset.id);
  });
  grid.addEventListener("input", e => {
    if (e.target.matches(".rm-note-input")) setNote(e.target.dataset.noteId, e.target.value);
    else if (e.target.id === "rm-add") searchToAdd(e.target.value);
    else if (e.target.id === "rm-name") setRoadmapName(e.target.value, e.target);
  });
  grid.addEventListener("keydown", e => {
    if (e.target.id !== "rm-add") return;
    if (e.key === "Enter") {
      const first = searchToAdd(e.target.value)[0];
      if (first) { e.preventDefault(); addToRoadmap(first.id, { focusAdd: true }); }
    } else if (e.key === "Escape") { e.stopPropagation(); e.target.value = ""; searchToAdd(""); }
  });
  grid.addEventListener("change", e => {
    if (!e.target.matches(".pill-pick input, .lc-pick input")) return;
    const card = e.target.closest("[data-id]");
    if (card) state.toggleCart(card.dataset.id);
  });
  grid.addEventListener("keydown", e => {
    if (e.target.matches("input") || e.target.closest(".react-flow") || (e.key !== "Enter" && e.key !== " ")) return;
    const colhead = e.target.closest(".mx-colhead");
    const card = e.target.closest("[data-id]");
    if (!colhead && !card) return;
    e.preventDefault();
    if (colhead) location.hash = `#/domain/${colhead.dataset.navDomain}`;
    else if (e.key === "Enter") openCert(card.dataset.id);
    else state.toggleCart(card.dataset.id);
  });

  const flow = $("#flow");
  const flowOpen = e => {
    if (e.target.closest(".flow-head")) return;
    const node = e.target.closest(".flow-node[data-id]");
    if (node) { e.preventDefault(); openCert(node.dataset.id); }
  };
  flow.addEventListener("click", flowOpen);
  flow.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") flowOpen(e); });

  $("#drawer-content").addEventListener("click", e => {
    if (!drawerCert) return;
    const tag = e.target.closest("a[data-tag]");
    if (tag) {
      // The href is a real link (it can be copied or opened in a new tab); a
      // plain click applies the filter in place and shows the results.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      showTag(tag.dataset.tag);
      return;
    }
    if (e.target.closest("[data-open-roadmap]")) { addToRoadmap(drawerCert); return; }
    if (e.target.closest("[data-toggle-cart]")) state.toggleCart(drawerCert);
    else if (e.target.closest("[data-copy-link]")) copyText(certUrl(drawerCert), "Link copied");
  });
  $("#drawer-close").addEventListener("click", closeDrawer);
  $("#drawer-prev").addEventListener("click", () => stepCert(-1));
  $("#drawer-next").addEventListener("click", () => stepCert(1));

  $("#cart-toggle").addEventListener("click", () => setCartOpen());
  $("#cart-close").addEventListener("click", () => setCartOpen(false));
  $("#cart-clear").addEventListener("click", clearSelection);
  $("#cart-md").addEventListener("click", exportMd);
  $("#cart-csv").addEventListener("click", exportCsv);
  $("#cart-share").addEventListener("click", () => copyText(myRoadmapUrl(), "Roadmap link copied"));
  $("#cart-view").addEventListener("click", viewMyRoadmap);
  $("#my-roadmap").addEventListener("click", viewMyRoadmap);
  $("#cart-name").value = state.roadmapName;
  $("#cart-name").addEventListener("input", e => setRoadmapName(e.target.value, e.target));

  // A click on empty space dismisses the open panel. Anything that does
  // something of its own (a card, a link, a control, the menu) is left alone,
  // so clicking another certification switches the drawer instead of closing it.
  document.addEventListener("click", e => {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest("#drawer, #cart, #cart-toggle, .ctx, dialog, [data-id], [data-rm], a, button, input, select, label, .react-flow")) return;
    if (drawerCert) closeDrawer();
    else if (!$("#cart").classList.contains("hidden")) setCartOpen(false);
  });

  window.addEventListener("hashchange", () => { closeContextMenu(); scheduleRender(); });

  // The matrix does not fit a phone, so narrow screens always get the list.
  // Crossing the breakpoint also resets the sidebar to that layout's default.
  const onNarrow = () => {
    if (narrow.matches && state.view !== "list") { state.view = "list"; scheduleRender(); }
    $("#sidebar").classList.remove("open");
    $("#backdrop").classList.add("hidden");
    $(".layout").classList.toggle("no-sidebar", !narrow.matches && store.get(SIDEBAR_KEY) === "0");
    $("#sidebar-toggle").setAttribute("aria-expanded", String(sidebarIsOpen()));
  };
  narrow.addEventListener?.("change", onNarrow); onNarrow();

  $("#sidebar-toggle").addEventListener("click", () => setSidebarOpen());
  $("#sidebar-close").addEventListener("click", () => setSidebarOpen(false));
  $("#rail-open").addEventListener("click", () => setSidebarOpen(true));
  $("#rail-reset").addEventListener("click", resetFilters);
  $("#backdrop").addEventListener("click", () => setSidebarOpen(false));

  rerender();
  logoIntro($(".logo"));
}

init().catch(err => {
  console.error(err);
  const pre = document.createElement("pre");
  pre.className = "load-error";
  pre.textContent = "Failed to load data: " + (err && err.message ? err.message : "unknown error");
  document.body.appendChild(pre);
});
