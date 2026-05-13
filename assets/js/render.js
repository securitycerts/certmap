const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", expert: "Expert" };
const LEVELS = ["beginner", "intermediate", "advanced", "expert"];
const LEVELS_DISPLAY = ["expert", "advanced", "intermediate", "beginner"];
const LEVEL_ORDER = Object.fromEntries(LEVELS.map((l, i) => [l, i]));
const LEVEL_HOURS = { beginner: 60, intermediate: 140, advanced: 260, expert: 420 };
export { LEVEL_HOURS, LEVEL_LABEL, LEVEL_ORDER, LEVELS };

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function fmtPrice(n) {
  if (n == null) return "—";
  if (n === 0) return "Free";
  return "$" + n.toLocaleString("en-US");
}

export function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

const LOGO_CACHE = new Map();
function vendorHost(c) {
  try { return new URL(c.url).hostname; } catch { return null; }
}
function vendorLogo(c, size = 64) {
  const host = vendorHost(c);
  if (!host) return null;
  const key = host + "@" + size;
  if (!LOGO_CACHE.has(key)) {
    LOGO_CACHE.set(key, `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(host)}`);
  }
  return LOGO_CACHE.get(key);
}
function makeLogo(c, cls, size) {
  const wrap = document.createElement("span");
  wrap.className = cls;
  const initial = (c.vendor || "?")[0].toUpperCase();
  wrap.textContent = initial;
  const url = vendorLogo(c, size);
  if (!url) return wrap;
  const img = new Image();
  img.loading = "lazy"; img.decoding = "async"; img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.src = url;
  img.addEventListener("load", () => { wrap.textContent = ""; wrap.appendChild(img); });
  img.addEventListener("error", () => { /* keep monogram */ });
  return wrap;
}

const SORTERS = {
  name: (a, b) => a.acronym.localeCompare(b.acronym),
  price_asc: (a, b) => (a.price_usd ?? Infinity) - (b.price_usd ?? Infinity),
  price_desc: (a, b) => (b.price_usd ?? -Infinity) - (a.price_usd ?? -Infinity),
  vendor: (a, b) => a.vendor.localeCompare(b.vendor) || a.acronym.localeCompare(b.acronym),
  level: (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.acronym.localeCompare(b.acronym),
};

export function sortCerts(arr, key) {
  return [...arr].sort(SORTERS[key] || SORTERS.name);
}

function sortMatrixCell(arr, key) {
  const inner = SORTERS[key] || SORTERS.name;
  return [...arr].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || inner(a, b));
}

export function renderMatrix(root, certs, meta, state) {
  root.replaceChildren();
  const matrix = document.createElement("div");
  matrix.className = "matrix";
  matrix.style.setProperty("--ncols", String(meta.domains.length));

  const corner = document.createElement("div");
  corner.className = "mx-corner";
  matrix.appendChild(corner);

  for (const domain of meta.domains) {
    const h = document.createElement("div");
    h.className = "mx-colhead";
    h.textContent = domain;
    h.title = `Open ${domain}`;
    h.addEventListener("click", () => { location.hash = `#/domain/${slug(domain)}`; });
    matrix.appendChild(h);
  }

  const idx = new Map();
  for (const c of certs) {
    const k = c.domain + "|" + c.level;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(c);
  }

  for (const level of LEVELS_DISPLAY) {
    const rh = document.createElement("div");
    rh.className = `mx-rowhead lvl-${level}`;
    rh.textContent = LEVEL_LABEL[level];
    matrix.appendChild(rh);
    for (const domain of meta.domains) {
      const cell = document.createElement("div");
      cell.className = "mx-cell";
      const arr = sortMatrixCell(idx.get(domain + "|" + level) || [], state.sort);
      for (const c of arr) cell.appendChild(pill(c, state));
      matrix.appendChild(cell);
    }
  }
  root.appendChild(matrix);
}

export function renderFlow(root, selected, byId) {
  root.replaceChildren();
  if (selected.length < 2) {
    root.classList.add("hidden");
    return;
  }
  root.classList.remove("hidden");

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

  const totalHours = ordered.reduce((a, c) => a + LEVEL_HOURS[c.level], 0);
  const totalCost = ordered.reduce((a, c) => a + (c.price_usd || 0), 0);
  const totalMonths = Math.round(totalHours / 10 / 4.3 * 10) / 10;

  const open = localStorage.getItem("certs-map.flow-open") !== "0";
  root.classList.toggle("collapsed", !open);

  const head = document.createElement("button");
  head.className = "flow-head";
  head.type = "button";
  head.innerHTML = `
    <div class="flow-head-left">
      <svg class="flow-caret" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 3.5 L5 6.5 L8 3.5"/></svg>
      <h3>Your path</h3>
      <span class="flow-sub">${ordered.length} certs · ${totalHours}h ≈ ${totalMonths} mo · $${totalCost.toLocaleString("en-US")}</span>
    </div>
  `;
  head.addEventListener("click", () => {
    const nowOpen = root.classList.toggle("collapsed");
    localStorage.setItem("certs-map.flow-open", nowOpen ? "0" : "1");
  });
  root.appendChild(head);

  const scroller = document.createElement("div");
  scroller.className = "flow-scroller";
  const chain = document.createElement("div");
  chain.className = "flow-chain";

  ordered.forEach((c, i) => {
    const node = document.createElement("div");
    node.className = `flow-node lvl-${c.level}`;
    node.dataset.tipId = c.id;
    node.innerHTML = `
      <div class="flow-step">Step ${i + 1}</div>
      <div class="flow-head-row">
        <div class="flow-acro">${esc(c.acronym)}</div>
      </div>
      <div class="flow-vendor">${esc(c.vendor)}</div>
      <div class="flow-stats">
        <span title="Estimated study time">⏱ ${LEVEL_HOURS[c.level]}h</span>
        <span title="Exam cost">${c.price_usd == null ? "—" : c.price_usd === 0 ? "Free" : "$" + c.price_usd.toLocaleString("en-US")}</span>
      </div>
    `;
    node.querySelector(".flow-head-row").prepend(makeLogo(c, "flow-logo", 64));
    node.addEventListener("click", () => { location.hash = `#/cert/${c.id}`; });
    chain.appendChild(node);
    if (i < ordered.length - 1) {
      const arrow = document.createElement("div");
      arrow.className = "flow-arrow";
      arrow.innerHTML = `<svg viewBox="0 0 24 12" width="24" height="12"><path d="M0 6 L20 6 M14 1 L20 6 L14 11" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      chain.appendChild(arrow);
    }
  });
  scroller.appendChild(chain);
  root.appendChild(scroller);
}

function pill(c, state) {
  const el = document.createElement("div");
  el.className = "pill" + (state.cart.has(c.id) ? " selected" : "") + (c.restricted_to ? " restricted" : "");
  el.dataset.level = c.level;
  el.dataset.id = c.id;
  el.dataset.tipId = c.id;
  const acro = document.createElement("div");
  acro.className = "pill-acro";
  acro.textContent = c.acronym;
  const pick = document.createElement("label");
  pick.className = "pill-pick";
  pick.addEventListener("click", e => e.stopPropagation());
  const cb = document.createElement("input");
  cb.type = "checkbox"; cb.checked = state.cart.has(c.id);
  cb.addEventListener("change", () => state.toggleCart(c.id));
  pick.appendChild(cb);
  el.append(acro, pick);
  el.addEventListener("click", () => { location.hash = `#/cert/${c.id}`; });
  return el;
}

export function renderList(root, certs, meta, state, { grouped = true, heading = null } = {}) {
  root.replaceChildren();
  if (heading) {
    const banner = document.createElement("div");
    banner.className = "search-banner";
    banner.innerHTML = heading;
    root.appendChild(banner);
  }
  if (!grouped) {
    const wrap = document.createElement("div");
    wrap.className = "list";
    sortCerts(certs, state.sort).forEach(c => wrap.appendChild(listCard(c, state)));
    root.appendChild(wrap);
    return;
  }
  for (const domain of meta.domains) {
    const items = sortCerts(certs.filter(c => c.domain === domain), state.sort);
    if (!items.length) continue;
    const head = document.createElement("div");
    head.className = "section-head";
    const h = document.createElement("h2"); h.textContent = domain;
    const cnt = document.createElement("span"); cnt.className = "count"; cnt.textContent = items.length + " certs";
    head.append(h, cnt);
    root.appendChild(head);
    const wrap = document.createElement("div");
    wrap.className = "list";
    items.forEach(c => wrap.appendChild(listCard(c, state)));
    root.appendChild(wrap);
  }
}

function listCard(c, state) {
  const el = document.createElement("div");
  el.className = "list-card" + (state.cart.has(c.id) ? " selected" : "") + (c.restricted_to ? " restricted" : "");
  el.dataset.level = c.level;
  el.dataset.id = c.id;
  el.dataset.tipId = c.id;
  const acroWrap = document.createElement("div");
  acroWrap.className = "lc-acro-wrap";
  const logo = makeLogo(c, "lc-logo", 64);
  const acro = document.createElement("div"); acro.className = "lc-acro"; acro.textContent = c.acronym;
  acroWrap.append(logo, acro);
  const pick = document.createElement("label"); pick.className = "lc-pick";
  pick.addEventListener("click", e => e.stopPropagation());
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.checked = state.cart.has(c.id);
  cb.addEventListener("change", () => state.toggleCart(c.id));
  pick.appendChild(cb);
  const name = document.createElement("div"); name.className = "lc-name"; name.textContent = c.name;
  const meta = document.createElement("div"); meta.className = "lc-meta";
  const tagV = document.createElement("span"); tagV.className = "lc-tag"; tagV.textContent = c.vendor;
  const tagL = document.createElement("span"); tagL.className = "lc-tag"; tagL.textContent = LEVEL_LABEL[c.level];
  const tagP = document.createElement("span"); tagP.className = "lc-price"; tagP.textContent = fmtPrice(c.price_usd);
  meta.append(tagV, tagL, tagP);
  el.append(acroWrap, pick, name, meta);
  el.addEventListener("click", () => { location.hash = `#/cert/${c.id}`; });
  return el;
}

export function renderDrawer(root, c, byId) {
  const prereqHtml = c.prerequisites.length
    ? c.prerequisites.map(p => `<span class="prereq-chip" data-id="${esc(p)}">${esc(byId.get(p)?.acronym || p)}</span>`).join("")
    : `<span class="muted">None</span>`;
  const tagsHtml = c.tags.length
    ? `<div class="tags">${c.tags.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
    : "";
  const restrictedHtml = c.restricted_to
    ? `<div class="restricted-badge" role="note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span>${esc(c.restricted_to)}</span></div>`
    : "";
  root.innerHTML = `
    <div class="drawer-head"></div>
    <h2>${esc(c.acronym)}</h2>
    <div class="sub">${esc(c.name)} · ${esc(c.vendor)}</div>
    ${restrictedHtml}
    <p class="desc">${esc(c.description)}</p>
    <dl>
      <dt>Domain</dt><dd>${esc(c.domain)}</dd>
      <dt>Level</dt><dd>${LEVEL_LABEL[c.level]}</dd>
      <dt>Price (USD)</dt><dd>${fmtPrice(c.price_usd)}${c.currency_note ? ` <span class="muted">· ${esc(c.currency_note)}</span>` : ""}</dd>
      <dt>Exam length</dt><dd>${c.duration_min ? c.duration_min + " min" : "—"}</dd>
      <dt>Renewal</dt><dd>${c.validity_years ? "Every " + c.validity_years + " years" : "Lifetime / none"}</dd>
      <dt>DoD 8140</dt><dd>${c.dod_8140 ? "Yes" : "No"}</dd>
      <dt>Prerequisites</dt><dd>${prereqHtml}</dd>
    </dl>
    ${tagsHtml}
    <div class="actions">
      <a class="btn-ghost" href="${esc(c.url)}" target="_blank" rel="noopener">Official page ↗</a>
      <button class="btn-ghost" data-toggle-cart>${state_has_in_cart(c) ? "Remove from selection" : "Add to selection"}</button>
    </div>
  `;
  root.querySelector(".drawer-head").appendChild(makeLogo(c, "drawer-logo", 128));
  root.querySelectorAll(".prereq-chip").forEach(el => {
    el.addEventListener("click", () => { location.hash = `#/cert/${el.dataset.id}`; });
  });
}
let _stateRef = null;
export function bindState(s) { _stateRef = s; }
function state_has_in_cart(c) { return _stateRef?.cart.has(c.id) || false; }

export function renderCart(listEl, totalEl, subEl, countEl, certs, state) {
  const items = certs.filter(c => state.cart.has(c.id));
  const sum = items.reduce((a, c) => a + (c.price_usd || 0), 0);
  listEl.replaceChildren();
  if (!items.length) {
    const p = document.createElement("p");
    p.className = "cart-empty";
    p.textContent = "No certifications selected yet.";
    listEl.appendChild(p);
  } else {
    for (const c of items) {
      const row = document.createElement("div");
      row.className = "cart-row";
      const a = document.createElement("span"); a.className = "acro"; a.textContent = c.acronym;
      const p = document.createElement("span"); p.className = "price"; p.textContent = fmtPrice(c.price_usd);
      const b = document.createElement("button"); b.className = "rm"; b.textContent = "×"; b.title = "Remove";
      b.addEventListener("click", () => state.toggleCart(c.id));
      row.append(a, p, b);
      listEl.appendChild(row);
    }
  }
  const fmt = "$" + sum.toLocaleString("en-US");
  totalEl.textContent = fmt;
  subEl.textContent = fmt;
  countEl.textContent = String(items.length);
}

export function buildFilters({ levelEl, domainEl, vendorEl }, meta, state, onChange) {
  levelEl.replaceChildren();
  LEVELS.forEach(l => {
    const c = document.createElement("button");
    c.className = "chip" + (state.filters.levels.has(l) ? " active" : "");
    c.textContent = LEVEL_LABEL[l];
    c.addEventListener("click", () => {
      state.filters.levels.has(l) ? state.filters.levels.delete(l) : state.filters.levels.add(l);
      c.classList.toggle("active");
      onChange();
    });
    levelEl.appendChild(c);
  });
  domainEl.replaceChildren();
  meta.domains.forEach(d => {
    const lbl = document.createElement("label");
    const inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = state.filters.domains.has(d);
    const span = document.createElement("span"); span.textContent = d;
    lbl.append(inp, span);
    inp.addEventListener("change", e => {
      e.target.checked ? state.filters.domains.add(d) : state.filters.domains.delete(d);
      onChange();
    });
    domainEl.appendChild(lbl);
  });
  vendorEl.replaceChildren();
  meta.vendors.forEach(v => {
    const lbl = document.createElement("label");
    const inp = document.createElement("input"); inp.type = "checkbox"; inp.checked = state.filters.vendors.has(v);
    const span = document.createElement("span"); span.textContent = v;
    lbl.append(inp, span);
    inp.addEventListener("change", e => {
      e.target.checked ? state.filters.vendors.add(v) : state.filters.vendors.delete(v);
      onChange();
    });
    vendorEl.appendChild(lbl);
  });
}
