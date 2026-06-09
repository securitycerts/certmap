import {
  LEVELS, LEVELS_DISPLAY, LEVEL_LABEL, LEVEL_ORDER, LEVEL_HOURS,
  fmtPrice, fmtAgo, slug,
} from "./format.js";
import { el, svg } from "./dom.js";
import { makeLogo } from "./logo.js";

export { slug, fmtPrice };

// Cards and pills stay "dumb": they carry their identity in data-* attributes and
// have no listeners of their own. Clicks are handled by delegated listeners in
// app.js, so we never attach (and later garbage-collect) a listener per cert on
// every re-render.

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
  const matrix = el("div", { class: "matrix" });
  matrix.style.setProperty("--ncols", String(meta.domains.length));
  matrix.appendChild(el("div", { class: "mx-corner" }));

  for (const domain of meta.domains) {
    matrix.appendChild(el("div", {
      class: "mx-colhead",
      title: `Open ${domain}`,
      "data-nav-domain": slug(domain),
      text: domain,
    }));
  }

  const idx = new Map();
  for (const c of certs) {
    const k = c.domain + "|" + c.level;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(c);
  }

  for (const level of LEVELS_DISPLAY) {
    matrix.appendChild(el("div", { class: `mx-rowhead lvl-${level}`, text: LEVEL_LABEL[level] }));
    for (const domain of meta.domains) {
      const cell = el("div", { class: "mx-cell" });
      const arr = sortMatrixCell(idx.get(domain + "|" + level) || [], state.sort);
      for (const c of arr) cell.appendChild(pill(c, state));
      matrix.appendChild(cell);
    }
  }
  root.replaceChildren(matrix);
}

export function renderFlow(root, selected, byId) {
  if (selected.length < 2) {
    root.replaceChildren();
    root.classList.add("hidden");
    return;
  }
  root.classList.remove("hidden");

  const ordered = orderByPrerequisite(selected);
  const totalHours = ordered.reduce((a, c) => a + LEVEL_HOURS[c.level], 0);
  const totalCost = ordered.reduce((a, c) => a + (c.price_usd || 0), 0);
  const totalMonths = Math.round(totalHours / 10 / 4.3 * 10) / 10;

  const open = localStorage.getItem("certs-map.flow-open") !== "0";
  root.classList.toggle("collapsed", !open);

  const caret = svg(
    { class: "flow-caret", width: "10", height: "10", viewBox: "0 0 10 10", fill: "none", stroke: "currentColor", "stroke-width": "1.6" },
    { d: "M2 3.5 L5 6.5 L8 3.5" },
  );
  const head = el("button", { class: "flow-head", type: "button" },
    el("div", { class: "flow-head-left" },
      caret,
      el("h3", { text: "Your path" }),
      el("span", { class: "flow-sub", text: `${ordered.length} certs · ${totalHours}h ≈ ${totalMonths} mo · $${totalCost.toLocaleString("en-US")}` }),
    ),
  );
  head.addEventListener("click", () => {
    const nowOpen = root.classList.toggle("collapsed");
    localStorage.setItem("certs-map.flow-open", nowOpen ? "0" : "1");
  });

  const chain = el("div", { class: "flow-chain" });
  ordered.forEach((c, i) => {
    const headRow = el("div", { class: "flow-head-row" }, el("div", { class: "flow-acro", text: c.acronym }));
    headRow.prepend(makeLogo(c, "flow-logo", 64));
    chain.appendChild(el("div", { class: `flow-node lvl-${c.level}`, "data-tip-id": c.id, "data-id": c.id },
      el("div", { class: "flow-step", text: `Step ${i + 1}` }),
      headRow,
      el("div", { class: "flow-vendor", text: c.vendor }),
      el("div", { class: "flow-stats" },
        el("span", { title: "Estimated study time", text: `⏱ ${LEVEL_HOURS[c.level]}h` }),
        el("span", { title: "Exam cost", text: fmtPrice(c.price_usd) }),
      ),
    ));
    if (i < ordered.length - 1) {
      chain.appendChild(el("div", { class: "flow-arrow" }, svg(
        { viewBox: "0 0 24 12", width: "24", height: "12" },
        { d: "M0 6 L20 6 M14 1 L20 6 L14 11", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round" },
      )));
    }
  });

  root.replaceChildren(head, el("div", { class: "flow-scroller" }, chain));
}

// Topologically order the selected certs so prerequisites come before the certs
// that need them, falling back to level then acronym. Anything we can't place
// (a cycle, or a prerequisite that isn't selected) is appended at the end.
function orderByPrerequisite(selected) {
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

function pill(c, state) {
  return el("div", {
    class: "pill" + (state.cart.has(c.id) ? " selected" : "") + (c.restricted_to ? " restricted" : ""),
    "data-level": c.level,
    "data-id": c.id,
    "data-tip-id": c.id,
  },
    el("div", { class: "pill-acro", text: c.acronym }),
    el("label", { class: "pill-pick" }, el("input", { type: "checkbox", checked: state.cart.has(c.id) })),
  );
}

export function renderList(root, certs, meta, state, { grouped = true, heading = null } = {}) {
  const frag = document.createDocumentFragment();
  if (heading) frag.appendChild(el("div", { class: "search-banner" }, heading));
  if (!grouped) {
    const wrap = el("div", { class: "list" });
    sortCerts(certs, state.sort).forEach(c => wrap.appendChild(listCard(c, state)));
    frag.appendChild(wrap);
    root.replaceChildren(frag);
    return;
  }
  for (const domain of meta.domains) {
    const items = sortCerts(certs.filter(c => c.domain === domain), state.sort);
    if (!items.length) continue;
    frag.appendChild(el("div", { class: "section-head" },
      el("h2", { text: domain }),
      el("span", { class: "count", text: items.length + " certs" }),
    ));
    const wrap = el("div", { class: "list" });
    items.forEach(c => wrap.appendChild(listCard(c, state)));
    frag.appendChild(wrap);
  }
  root.replaceChildren(frag);
}

function listCard(c, state) {
  const acroWrap = el("div", { class: "lc-acro-wrap" },
    makeLogo(c, "lc-logo", 64),
    el("div", { class: "lc-acro", text: c.acronym }),
  );
  return el("div", {
    class: "list-card" + (state.cart.has(c.id) ? " selected" : "") + (c.restricted_to ? " restricted" : ""),
    "data-level": c.level,
    "data-id": c.id,
    "data-tip-id": c.id,
  },
    acroWrap,
    el("label", { class: "lc-pick" }, el("input", { type: "checkbox", checked: state.cart.has(c.id) })),
    el("div", { class: "lc-name", text: c.name }),
    el("div", { class: "lc-meta" },
      el("span", { class: "lc-tag", text: c.vendor }),
      el("span", { class: "lc-tag", text: LEVEL_LABEL[c.level] }),
      el("span", { class: "lc-price", text: fmtPrice(c.price_usd) }),
    ),
  );
}

export function renderDrawer(root, c, byId) {
  const priceDd = el("dd", {}, fmtPrice(c.price_usd));
  if (c.currency_note) priceDd.append(" ", el("span", { class: "muted", text: "· " + c.currency_note }));
  if (c.price_verified_at) {
    priceDd.append(" ", el("span", {
      class: "verified-badge",
      title: "Last verified on " + c.price_verified_at,
      text: "verified " + fmtAgo(c.price_verified_at),
    }));
  }

  const renewalDd = el("dd", {}, c.validity_years ? "Every " + c.validity_years + " years" : "Lifetime / none");
  if (Number.isFinite(c.renewal_cost)) {
    renewalDd.append(" ", el("span", { class: "muted", text: "· $" + c.renewal_cost.toLocaleString("en-US") }));
  }

  const prereqDd = el("dd", {});
  if (c.prerequisites.length) {
    for (const p of c.prerequisites) {
      prereqDd.appendChild(el("span", { class: "prereq-chip", "data-id": p, text: byId.get(p)?.acronym || p }));
    }
  } else {
    prereqDd.appendChild(el("span", { class: "muted", text: "None" }));
  }

  const dl = el("dl", {},
    el("dt", { text: "Domain" }),
    el("dd", {}, el("a", { href: `#/domain/${slug(c.domain)}`, class: "muted", text: c.domain })),
    el("dt", { text: "Level" }), el("dd", { text: LEVEL_LABEL[c.level] }),
    el("dt", { text: "Price (USD)" }), priceDd,
    c.exam_count > 1 ? [el("dt", { text: "Exams required" }), el("dd", { text: String(c.exam_count) })] : null,
    el("dt", { text: "Exam length" }), el("dd", { text: c.duration_min ? c.duration_min + " min" : "–" }),
    el("dt", { text: "Hands-on" }), el("dd", { text: c.hands_on ? "Yes" : "No" }),
    el("dt", { text: "Renewal" }), renewalDd,
    el("dt", { text: "DoD 8140" }), el("dd", { text: c.dod_8140 ? "Yes" : "No" }),
    el("dt", { text: "Prerequisites" }), prereqDd,
  );

  const head = el("div", { class: "drawer-head" });
  head.appendChild(makeLogo(c, "drawer-logo", 128));

  const children = [
    head,
    el("h2", { text: c.acronym }),
    el("div", { class: "sub" },
      c.name + " · ",
      el("a", { href: `#/vendor/${slug(c.vendor)}`, class: "sub-vendor", text: c.vendor }),
    ),
  ];

  if (c.restricted_to) {
    children.push(el("div", { class: "restricted-badge", role: "note" },
      svg({ width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "aria-hidden": "true" },
        { tag: "rect", x: "3", y: "11", width: "18", height: "11", rx: "2" },
        { d: "M7 11V7a5 5 0 0 1 10 0v4" }),
      el("span", { text: c.restricted_to }),
    ));
  }

  children.push(el("p", { class: "desc", text: c.description }), dl);

  if (c.tags.length) {
    children.push(el("div", { class: "tags" }, c.tags.map(t => el("span", { class: "tag", text: t }))));
  }

  children.push(el("div", { class: "actions" },
    el("a", { class: "btn-ghost", href: c.url, target: "_blank", rel: "noopener", text: "Official page ↗" }),
    el("button", { class: "btn-ghost", "data-toggle-cart": true, text: state_has_in_cart(c) ? "Remove from selection" : "Add to selection" }),
  ));

  root.replaceChildren(...children);
  root.querySelectorAll(".prereq-chip").forEach(chip => {
    chip.addEventListener("click", () => { location.hash = `#/cert/${chip.dataset.id}`; });
  });
}
let _stateRef = null;
export function bindState(s) { _stateRef = s; }
function state_has_in_cart(c) { return _stateRef?.cart.has(c.id) || false; }

export function renderCart(listEl, totalEl, subEl, countEl, certs, state) {
  const items = certs.filter(c => state.cart.has(c.id));
  const sum = items.reduce((a, c) => a + (c.price_usd || 0), 0);
  if (!items.length) {
    listEl.replaceChildren(el("p", { class: "cart-empty", text: "No certifications selected yet." }));
  } else {
    const rows = items.map(c => {
      const rm = el("button", { class: "rm", title: "Remove", text: "×" });
      rm.addEventListener("click", () => state.toggleCart(c.id));
      return el("div", { class: "cart-row" },
        el("span", { class: "acro", text: c.acronym }),
        el("span", { class: "price", text: fmtPrice(c.price_usd) }),
        rm,
      );
    });
    listEl.replaceChildren(...rows);
  }
  const fmt = "$" + sum.toLocaleString("en-US");
  totalEl.textContent = fmt;
  subEl.textContent = fmt;
  countEl.textContent = String(items.length);
}

export function buildFilters({ levelEl, domainEl, vendorEl }, meta, state, onChange) {
  levelEl.replaceChildren(...LEVELS.map(l => {
    const chip = el("button", {
      class: "chip" + (state.filters.levels.has(l) ? " active" : ""),
      text: LEVEL_LABEL[l],
    });
    chip.addEventListener("click", () => {
      state.filters.levels.has(l) ? state.filters.levels.delete(l) : state.filters.levels.add(l);
      chip.classList.toggle("active");
      onChange();
    });
    return chip;
  }));

  domainEl.replaceChildren(...meta.domains.map(d => {
    const inp = el("input", { type: "checkbox", checked: state.filters.domains.has(d) });
    inp.addEventListener("change", e => {
      e.target.checked ? state.filters.domains.add(d) : state.filters.domains.delete(d);
      onChange();
    });
    return el("label", {}, inp, el("span", { text: d }));
  }));

  vendorEl.replaceChildren(...meta.vendors.map(v => {
    const inp = el("input", { type: "checkbox", checked: state.filters.vendors.has(v) });
    inp.addEventListener("change", e => {
      e.target.checked ? state.filters.vendors.add(v) : state.filters.vendors.delete(v);
      onChange();
    });
    return el("label", { "data-vendor": v.toLowerCase() }, inp, el("span", { text: v }));
  }));
}
