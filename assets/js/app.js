import { loadData } from "./data.js";
import { renderMatrix, renderList, renderDrawer, renderCart, renderFlow, buildFilters, bindState, slug, fmtPrice } from "./render.js";
import { initTooltip } from "./tooltip.js";

const $ = sel => document.querySelector(sel);
const CART_KEY = "certs-map.cart.v1";
const THEME_KEY = "certs-map.theme";
const VIEW_KEY = "certs-map.view";
const SORT_KEY = "certs-map.sort";

const escHTML = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function safeLoadCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter(x => typeof x === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x)).slice(0, 200);
  } catch { return []; }
}

const ALLOWED_THEMES = new Set(["dark", "light"]);
const ALLOWED_VIEWS = new Set(["matrix", "list"]);
const ALLOWED_SORTS = new Set(["name", "price_asc", "price_desc", "vendor", "level"]);
function safeLS(key, allowed, fallback) {
  const v = localStorage.getItem(key);
  return allowed.has(v) ? v : fallback;
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
  },
  cart: new Set(safeLoadCart()),
  toggleCart(id) {
    this.cart.has(id) ? this.cart.delete(id) : this.cart.add(id);
    localStorage.setItem(CART_KEY, JSON.stringify([...this.cart]));
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
  document.querySelectorAll(`[data-id="${CSS.escape(id)}"]`).forEach(el => {
    el.classList.toggle("selected", selected);
    const cb = el.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = selected;
  });
  const items = DATA.certs.filter(c => state.cart.has(c.id));
  renderCart($("#cart-list"), $("#cart-total"), $("#cart-subtotal"), $("#cart-count"), DATA.certs, state);
  renderFlow($("#flow"), items, DATA.byId);
  const btn = $("#drawer-content").querySelector("[data-toggle-cart]");
  const cmatch = (location.hash || "").match(/^#\/cert\/(.+)$/);
  if (btn && cmatch) btn.textContent = state.cart.has(cmatch[1]) ? "Remove from selection" : "Add to selection";
}

function rerender() {
  const filtered = applyFilters(DATA.certs);
  const grid = $("#grid");
  const empty = $("#empty");
  const hash = location.hash || "#/";

  const dmatch = hash.match(/^#\/domain\/(.+)$/);
  const cmatch = hash.match(/^#\/cert\/(.+)$/);

  if (dmatch) {
    const domain = DATA.meta.domains.find(d => slug(d) === dmatch[1]);
    if (domain) {
      const certs = filtered.filter(c => c.domain === domain);
      renderList(grid, certs, DATA.meta, state, {
        grouped: false,
        heading: `<span><a href="#/" class="muted">← All domains</a> · <strong>${escHTML(domain)}</strong> · ${certs.length} certifications</span>`
      });
    } else { renderMatrix(grid, filtered, DATA.meta, state); }
  } else if (state.search.trim()) {
    renderList(grid, filtered, DATA.meta, state, {
      grouped: false,
      heading: `<span>Search results for <strong>"${escHTML(state.search.trim())}"</strong></span><span class="muted">${filtered.length} ${filtered.length === 1 ? "match" : "matches"}</span>`
    });
  } else if (state.view === "list") {
    renderList(grid, filtered, DATA.meta, state, { grouped: true });
  } else {
    renderMatrix(grid, filtered, DATA.meta, state);
  }

  empty.classList.toggle("hidden", filtered.length > 0);
  $("#result-count").textContent = `${filtered.length} of ${DATA.certs.length} certifications`;

  if (cmatch && DATA.byId.has(cmatch[1])) {
    $("#drawer").classList.remove("hidden");
    $("#drawer").setAttribute("aria-hidden", "false");
    renderDrawer($("#drawer-content"), DATA.byId.get(cmatch[1]), DATA.byId);
    const btn = $("#drawer-content").querySelector("[data-toggle-cart]");
    if (btn) btn.addEventListener("click", () => state.toggleCart(cmatch[1]));
  } else {
    $("#drawer").classList.add("hidden");
    $("#drawer").setAttribute("aria-hidden", "true");
  }

  renderCart($("#cart-list"), $("#cart-total"), $("#cart-subtotal"), $("#cart-count"), DATA.certs, state);

  const selected = DATA.certs.filter(c => state.cart.has(c.id));
  renderFlow($("#flow"), selected, DATA.byId);

  document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.view === state.view));
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
}

async function init() {
  document.documentElement.dataset.theme = safeLS(THEME_KEY, ALLOWED_THEMES, "dark");
  DATA = await loadData();
  for (const id of [...state.cart]) if (!DATA.byId.has(id)) state.cart.delete(id);
  initTooltip(DATA);

  buildFilters(
    { levelEl: $("#filter-level"), domainEl: $("#filter-domain"), vendorEl: $("#filter-vendor") },
    DATA.meta, state, rerender
  );

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const onSearch = debounce(v => { state.search = v; rerender(); }, 80);
  $("#search").addEventListener("input", e => onSearch(e.target.value));
  $("#search").addEventListener("keydown", e => { if (e.key === "Escape") { e.target.value = ""; state.search = ""; rerender(); } });

  document.addEventListener("keydown", e => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "SELECT") {
      e.preventDefault(); $("#search").focus();
    }
    if (e.key === "Escape" && !$("#drawer").classList.contains("hidden")) {
      location.hash = "#/";
    }
  });

  const sortEl = $("#sort"); sortEl.value = state.sort;
  sortEl.addEventListener("change", e => { state.sort = e.target.value; localStorage.setItem(SORT_KEY, state.sort); rerender(); });

  document.querySelectorAll(".seg-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      localStorage.setItem(VIEW_KEY, state.view);
      rerender();
    });
  });

  $("#price-min").addEventListener("input", e => { state.filters.priceMin = e.target.value ? Number(e.target.value) : null; rerender(); });
  $("#price-max").addEventListener("input", e => { state.filters.priceMax = e.target.value ? Number(e.target.value) : null; rerender(); });
  $("#free-only").addEventListener("change", e => { state.filters.freeOnly = e.target.checked; rerender(); });
  $("#dod-only").addEventListener("change", e => { state.filters.dodOnly = e.target.checked; rerender(); });
  $("#no-prereq").addEventListener("change", e => { state.filters.noPrereq = e.target.checked; rerender(); });

  document.querySelectorAll(".filter-clear").forEach(el => {
    el.addEventListener("click", () => {
      state.filters[el.dataset.clear] = new Set();
      buildFilters({ levelEl: $("#filter-level"), domainEl: $("#filter-domain"), vendorEl: $("#filter-vendor") }, DATA.meta, state, rerender);
      rerender();
    });
  });

  $("#reset-filters").addEventListener("click", () => {
    state.search = ""; $("#search").value = "";
    state.filters = { levels: new Set(), domains: new Set(), vendors: new Set(), priceMin: null, priceMax: null, freeOnly: false, dodOnly: false, noPrereq: false };
    $("#price-min").value = ""; $("#price-max").value = "";
    document.querySelectorAll("#sidebar input[type=checkbox]").forEach(i => i.checked = false);
    buildFilters({ levelEl: $("#filter-level"), domainEl: $("#filter-domain"), vendorEl: $("#filter-vendor") }, DATA.meta, state, rerender);
    rerender();
  });

  $("#theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  });

  $("#drawer-close").addEventListener("click", () => { location.hash = "#/"; });
  $("#cart-toggle").addEventListener("click", () => $("#cart").classList.toggle("hidden"));
  $("#cart-close").addEventListener("click", () => $("#cart").classList.add("hidden"));
  $("#cart-clear").addEventListener("click", () => { state.cart.clear(); localStorage.setItem(CART_KEY, "[]"); rerender(); });
  $("#cart-md").addEventListener("click", exportMd);
  $("#cart-csv").addEventListener("click", exportCsv);

  window.addEventListener("hashchange", rerender);

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
