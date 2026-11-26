// A drop-down drawn by the app instead of the browser's own. The native <select>
// stays in the page as the source of truth (value, change events, forms,
// no-script); the picker only replaces how it looks and is used. A picker with
// `search` gets a filter box, used for long lists such as currencies.

import { el } from "./dom.js?v=ac02db00";

let open = null; // the picker whose list is showing

function close() {
  if (!open) return;
  open.wrap.classList.remove("open");
  open.button.setAttribute("aria-expanded", "false");
  open.pop.hidden = true;
  open = null;
}
document.addEventListener("pointerdown", e => { if (open && !open.wrap.contains(e.target)) close(); });
window.addEventListener("resize", close);

export function enhanceSelect(select, { search = false, label = o => o.textContent, short = label, placeholder = "Search" } = {}) {
  if (!select || select.dataset.picker) return null;
  select.dataset.picker = "1";
  const wrap = el("div", { class: "picker" + (select.className ? " " + select.className : "") });
  const button = el("button", { type: "button", class: "picker-btn", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": select.getAttribute("aria-label") || "" });
  const text = el("span", { class: "picker-text" });
  button.append(text, el("span", { class: "picker-chev", "aria-hidden": "true" }));
  const list = el("ul", { class: "picker-list", role: "listbox", tabindex: "-1" });
  const input = search ? el("input", { type: "search", class: "picker-search", placeholder, "aria-label": placeholder, autocomplete: "off", spellcheck: "false" }) : null;
  const pop = el("div", { class: "picker-pop", hidden: true }, ...(input ? [input] : []), list);
  select.after(wrap);
  wrap.append(select, button, pop);
  select.classList.add("picker-native");
  select.tabIndex = -1;
  select.setAttribute("aria-hidden", "true");

  const self = { wrap, button, pop };
  let active = -1;
  const items = () => [...list.children].filter(li => !li.hidden);

  function paint() {
    const opt = select.selectedOptions[0];
    text.textContent = opt ? short(opt) : "";
    list.replaceChildren(...[...select.options].map(o => {
      const li = el("li", { role: "option", class: "picker-opt", "data-value": o.value, "aria-selected": String(o.selected), text: label(o) });
      if (o.disabled) li.setAttribute("aria-disabled", "true");
      return li;
    }));
  }
  function highlight(i) {
    const vis = items();
    vis.forEach(li => li.classList.remove("active"));
    active = Math.max(0, Math.min(i, vis.length - 1));
    if (vis[active]) { vis[active].classList.add("active"); vis[active].scrollIntoView({ block: "nearest" }); }
  }
  function filter() {
    const q = (input?.value || "").trim().toLowerCase();
    for (const li of list.children) li.hidden = !!q && !(li.dataset.value + " " + li.textContent).toLowerCase().includes(q);
    highlight(0);
  }
  function show() {
    if (open && open !== self) close();
    open = self;
    paint();
    wrap.classList.add("open");
    button.setAttribute("aria-expanded", "true");
    pop.hidden = false;
    if (input) { input.value = ""; filter(); input.focus(); }
    else { list.focus(); highlight(items().findIndex(li => li.getAttribute("aria-selected") === "true")); }
    if (!input) highlight(Math.max(0, items().findIndex(li => li.getAttribute("aria-selected") === "true")));
  }
  function choose(li) {
    if (!li || li.getAttribute("aria-disabled") === "true") return;
    close();
    button.focus();
    if (select.value === li.dataset.value && li.dataset.value !== "") return;
    select.value = li.dataset.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    paint();
  }
  function keys(e) {
    const vis = items();
    if (e.key === "ArrowDown") { e.preventDefault(); highlight(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); highlight(active - 1); }
    else if (e.key === "Home") { e.preventDefault(); highlight(0); }
    else if (e.key === "End") { e.preventDefault(); highlight(vis.length - 1); }
    else if (e.key === "Enter") { e.preventDefault(); choose(vis[active]); }
    else if (e.key === "Escape" || e.key === "Tab") { close(); if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); button.focus(); } }
  }

  button.addEventListener("click", () => (open === self ? close() : show()));
  button.addEventListener("keydown", e => { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key) && open !== self) { e.preventDefault(); show(); } });
  list.addEventListener("click", e => choose(e.target.closest(".picker-opt")));
  list.addEventListener("pointermove", e => { const li = e.target.closest(".picker-opt"); if (li) highlight(items().indexOf(li)); });
  list.addEventListener("keydown", keys);
  input?.addEventListener("input", filter);
  input?.addEventListener("keydown", keys);
  // The app sets the value or the options from code; keep the button in step.
  select.addEventListener("change", paint);
  new MutationObserver(paint).observe(select, { childList: true, subtree: true, attributes: true });
  self.refresh = paint;
  paint();
  return self;
}
