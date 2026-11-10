import {
  LEVELS, LEVELS_DISPLAY, LEVEL_LABEL, LEVEL_ORDER, LEVEL_HOURS,
  fmtPrice, fmtAgo, isStale, slug,
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
      tabindex: "0",
      role: "link",
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
  const head = el("button", { class: "flow-head", type: "button", "aria-expanded": String(open) },
    el("div", { class: "flow-head-left" },
      caret,
      el("h3", { text: "Your path" }),
      el("span", { class: "flow-sub", text: `${ordered.length} certs · ${totalHours}h ≈ ${totalMonths} mo · $${totalCost.toLocaleString("en-US")}` }),
    ),
  );
  head.addEventListener("click", () => {
    const collapsed = root.classList.toggle("collapsed");
    head.setAttribute("aria-expanded", String(!collapsed));
    localStorage.setItem("certs-map.flow-open", collapsed ? "0" : "1");
  });

  const chain = el("div", { class: "flow-chain" });
  ordered.forEach((c, i) => {
    const headRow = el("div", { class: "flow-head-row" }, el("div", { class: "flow-acro", text: c.acronym }));
    headRow.prepend(makeLogo(c, "flow-logo", 64));
    chain.appendChild(el("div", { class: `flow-node lvl-${c.level}`, "data-tip-id": c.id, "data-id": c.id, tabindex: "0", role: "button", "aria-label": `Step ${i + 1}: ${c.acronym}` },
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

// A roadmap opened from a shared link: the certs in the order they should be
// taken, with the same cost and study-time totals as the path planner. `same`
// is true when the roadmap already matches the visitor's own selection.
export function renderRoadmap(root, selected, state, { name, same }) {
  const ordered = orderByPrerequisite(selected);
  if (!ordered.length) {
    root.replaceChildren(el("div", { class: "rm-head" },
      el("div", {},
        el("h2", { text: "Empty roadmap" }),
        el("p", { class: "rm-sub", text: "This link does not contain any certification from the current dataset." })),
      el("div", { class: "rm-actions" }, el("a", { class: "btn-ghost", href: "#/", text: "Browse all certifications" })),
    ));
    return;
  }
  const hours = ordered.reduce((a, c) => a + LEVEL_HOURS[c.level], 0);
  const cost = ordered.reduce((a, c) => a + (c.price_usd || 0), 0);
  const months = Math.round(hours / 10 / 4.3 * 10) / 10;
  const unknown = ordered.filter(c => c.price_usd == null).length;

  const head = el("div", { class: "rm-head" },
    el("div", {},
      el("p", { class: "rm-kicker", text: "Roadmap" }),
      el("h2", { text: name || "Certification roadmap" }),
      el("p", { class: "rm-sub", text:
        `${ordered.length} ${ordered.length === 1 ? "certification" : "certifications"} · ${hours}h of study ≈ ${months} months at 10h a week · $${cost.toLocaleString("en-US")}` +
        (unknown ? ` plus ${unknown} with no published price` : "") }),
    ),
    el("div", { class: "rm-actions" },
      el("button", { type: "button", class: "btn-ghost primary", "data-rm": "adopt", disabled: same, text: same ? "This is your selection" : "Use as my selection" }),
      el("button", { type: "button", class: "btn-ghost", "data-rm": "copy", text: "Copy link" }),
      el("a", { class: "btn-ghost", href: "#/", text: "Browse all" }),
    ),
  );
  const steps = el("ol", { class: "rm-steps" }, ordered.map((c, i) =>
    el("li", { class: "rm-step" }, el("span", { class: "rm-num", "aria-hidden": "true", text: String(i + 1) }), listCard(c, state))));
  root.replaceChildren(head, steps);
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

// Cards behave like buttons: focusable, Enter opens the cert, Space toggles it
// in the selection (see the delegated keydown handler in app.js).
function cardA11y(c) {
  return {
    tabindex: "0",
    role: "button",
    "aria-label": `${c.acronym}, ${c.name}, ${c.vendor}, ${LEVEL_LABEL[c.level]}, ${fmtPrice(c.price_usd)}`,
  };
}

function pickBox(c, state) {
  return el("input", {
    type: "checkbox",
    checked: state.cart.has(c.id),
    tabindex: "-1",
    "aria-label": `Select ${c.acronym}`,
  });
}

function pill(c, state) {
  return el("div", {
    class: "pill" + (state.cart.has(c.id) ? " selected" : "") + (c.restricted_to ? " restricted" : ""),
    "data-level": c.level,
    "data-id": c.id,
    "data-tip-id": c.id,
    ...cardA11y(c),
  },
    el("div", { class: "pill-acro", text: c.acronym }),
    el("label", { class: "pill-pick" }, pickBox(c, state)),
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
    ...cardA11y(c),
  },
    acroWrap,
    el("label", { class: "lc-pick" }, pickBox(c, state)),
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
    const stale = isStale(c.price_verified_at);
    priceDd.append(" ", el("span", {
      class: "verified-badge" + (stale ? " stale" : ""),
      title: "Last verified on " + c.price_verified_at + (stale ? ". Older than six months, confirm with the vendor." : ""),
      text: "verified " + fmtAgo(c.price_verified_at),
    }));
  } else if (c.price_usd != null) {
    priceDd.append(" ", el("span", {
      class: "verified-badge stale",
      title: "This figure has not been confirmed against the vendor's page.",
      text: "unverified",
    }));
  }

  const renewalDd = el("dd", {}, c.validity_years ? "Every " + c.validity_years + " years" : "Lifetime / none");
  if (Number.isFinite(c.renewal_cost)) {
    renewalDd.append(" ", el("span", { class: "muted", text: "· $" + c.renewal_cost.toLocaleString("en-US") }));
  }

  const prereqDd = el("dd", {});
  if (c.prerequisites.length) {
    for (const p of c.prerequisites) {
      prereqDd.appendChild(certChip(p, byId));
    }
  } else {
    prereqDd.appendChild(el("span", { class: "muted", text: "None" }));
  }

  // The reverse edge: certs that list this one as a prerequisite.
  const unlocks = [...byId.values()].filter(o => o.prerequisites.includes(c.id));
  const unlocksDd = el("dd", {}, unlocks.map(o => certChip(o.id, byId)));

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
    unlocks.length ? [el("dt", { text: "Leads to" }), unlocksDd] : null,
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
    el("a", { class: "btn-ghost", href: c.url, target: "_blank", rel: "noopener noreferrer", text: "Official page ↗" }),
    el("button", { class: "btn-ghost primary", type: "button", "data-toggle-cart": true, text: state_has_in_cart(c) ? "Remove from selection" : "Add to selection" }),
    el("button", { class: "btn-ghost", type: "button", "data-copy-link": true, text: "Copy link" }),
  ));

  root.replaceChildren(...children);
  root.scrollTop = 0;
}

function certChip(id, byId) {
  return el("a", { class: "prereq-chip", href: `#/cert/${id}`, "data-tip-id": id, text: byId.get(id)?.acronym || id });
}
let _stateRef = null;
export function bindState(s) { _stateRef = s; }
function state_has_in_cart(c) { return _stateRef?.cart.has(c.id) || false; }

// Paints the rows and the count, and returns the total so the caller can
// animate the two total labels.
export function renderCart(listEl, countEl, certs, state) {
  const items = certs.filter(c => state.cart.has(c.id));
  const sum = items.reduce((a, c) => a + (c.price_usd || 0), 0);
  if (!items.length) {
    listEl.replaceChildren(el("p", { class: "cart-empty", text: "No certifications selected yet." }));
  } else {
    const rows = items.map(c => {
      const rm = el("button", { class: "rm", type: "button", title: "Remove", "aria-label": `Remove ${c.acronym}`, text: "×" });
      rm.addEventListener("click", () => state.toggleCart(c.id));
      return el("div", { class: "cart-row", "data-ctx-id": c.id },
        el("a", { class: "acro", href: `#/cert/${c.id}`, text: c.acronym }),
        el("span", { class: "price", text: fmtPrice(c.price_usd) }),
        rm,
      );
    });
    listEl.replaceChildren(...rows);
  }
  countEl.textContent = String(items.length);
  return sum;
}

export function buildFilters({ levelEl, domainEl, vendorEl }, meta, state, onChange) {
  levelEl.replaceChildren(...LEVELS.map(l => {
    const chip = el("button", {
      type: "button",
      class: "chip" + (state.filters.levels.has(l) ? " active" : ""),
      "aria-pressed": String(state.filters.levels.has(l)),
      text: LEVEL_LABEL[l],
    });
    chip.addEventListener("click", () => {
      state.filters.levels.has(l) ? state.filters.levels.delete(l) : state.filters.levels.add(l);
      chip.setAttribute("aria-pressed", String(chip.classList.toggle("active")));
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
    return el("label", {}, inp, el("span", { class: "check-name", text: d }), el("span", { class: "check-count", text: String(meta.domainCount.get(d) || 0) }));
  }));

  vendorEl.replaceChildren(...meta.vendors.map(v => {
    const inp = el("input", { type: "checkbox", checked: state.filters.vendors.has(v) });
    inp.addEventListener("change", e => {
      e.target.checked ? state.filters.vendors.add(v) : state.filters.vendors.delete(v);
      onChange();
    });
    return el("label", { "data-vendor": v.toLowerCase() }, inp, el("span", { class: "check-name", text: v }), el("span", { class: "check-count", text: String(meta.vendorCount.get(v) || 0) }));
  }));
}
