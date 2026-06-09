import { fmtPrice } from "./format.js";

const DELAY = 450;
const HIDE_DELAY = 80;
const OFFSET = 12;

let tipEl = null;
let showTimer = null;
let hideTimer = null;
let currentTarget = null;
let DATA = null;

function ensureEl() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "tooltip";
  tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);
  return tipEl;
}

function render(c) {
  const el = ensureEl();
  el.replaceChildren();

  const head = document.createElement("div"); head.className = "tt-head";
  const acro = document.createElement("span"); acro.className = "tt-acro"; acro.textContent = c.acronym;
  const lvl = document.createElement("span"); lvl.className = `tt-lvl tt-lvl-${c.level}`; lvl.textContent = c.level;
  head.append(acro, lvl);
  el.appendChild(head);

  const name = document.createElement("div"); name.className = "tt-name"; name.textContent = c.name;
  el.appendChild(name);

  const vend = document.createElement("div"); vend.className = "tt-vendor"; vend.textContent = `${c.vendor} · ${c.domain}`;
  el.appendChild(vend);

  if (c.description) {
    const desc = document.createElement("p"); desc.className = "tt-desc"; desc.textContent = c.description;
    el.appendChild(desc);
  }

  const dl = document.createElement("dl"); dl.className = "tt-meta";
  const row = (k, v) => { const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; dl.append(dt, dd); };
  row("Price", fmtPrice(c.price_usd));
  if (c.duration_min) row("Exam", c.duration_min + " min");
  row("Renewal", c.validity_years ? c.validity_years + " yrs" : "Lifetime");
  if (c.dod_8140) row("DoD 8140", "Yes");
  if (c.prerequisites?.length) {
    const labels = c.prerequisites.map(id => DATA.byId.get(id)?.acronym || id).join(", ");
    row("Prereqs", labels);
  }
  el.appendChild(dl);
}

function position(rect) {
  const el = tipEl;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  let left = rect.right + OFFSET;
  let top = rect.top;
  if (left + tw + 8 > vw) left = rect.left - tw - OFFSET;
  if (left < 8) left = Math.max(8, Math.min(vw - tw - 8, rect.left));
  if (top + th + 8 > vh) top = Math.max(8, vh - th - 8);
  if (top < 8) top = 8;
  el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function show(target, cert) {
  render(cert);
  tipEl.classList.add("visible");
  requestAnimationFrame(() => position(target.getBoundingClientRect()));
}

function hide() {
  if (!tipEl) return;
  tipEl.classList.remove("visible");
  currentTarget = null;
}

function onEnter(e) {
  const target = e.target.closest("[data-tip-id]");
  if (!target || !DATA) return;
  const cert = DATA.byId.get(target.dataset.tipId);
  if (!cert) return;
  clearTimeout(hideTimer);
  clearTimeout(showTimer);
  currentTarget = target;
  showTimer = setTimeout(() => {
    if (currentTarget === target) show(target, cert);
  }, DELAY);
}

function onLeave(e) {
  const target = e.target.closest("[data-tip-id]");
  if (!target || target !== currentTarget) return;
  clearTimeout(showTimer);
  hideTimer = setTimeout(hide, HIDE_DELAY);
}

export function initTooltip(data) {
  DATA = data;
  if (!window.matchMedia("(hover: hover)").matches) return;
  document.addEventListener("mouseover", onEnter, true);
  document.addEventListener("mouseout", onLeave, true);
  document.addEventListener("scroll", hide, true);
  window.addEventListener("blur", hide);
}
