// Custom right-click menu. The page supplies a resolver that turns the element
// under the pointer into a list of items; returning null leaves the browser's
// own menu alone, which is what we want over inputs, links and selected text.
//
// Item shapes:
//   { label, action, hint?, disabled?, danger?, checked? }
//   { separator: true }
//   { heading: "text" }

import { el } from "./dom.js?v=3c4b6857";
import { menuIn } from "./motion.js?v=3c4b6857";

const MARGIN = 8;
let menu = null;
let returnFocus = null;

function close({ restore = false } = {}) {
  if (!menu) return;
  menu.remove();
  menu = null;
  if (restore && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
}

const itemsOf = () => Array.from(menu.querySelectorAll("[role^='menuitem']:not([aria-disabled='true'])"));

function focusItem(delta, absolute) {
  const items = itemsOf();
  if (!items.length) return;
  const at = items.indexOf(document.activeElement);
  const next = absolute != null ? absolute : (at + delta + items.length) % items.length;
  items[(next + items.length) % items.length].focus();
}

function build(items) {
  const node = el("div", { class: "ctx", role: "menu", tabindex: "-1" });
  for (const item of items) {
    if (!item) continue;
    if (item.separator) { node.appendChild(el("div", { class: "ctx-sep", role: "separator" })); continue; }
    if (item.heading) { node.appendChild(el("div", { class: "ctx-head", text: item.heading })); continue; }
    const checkable = item.checked != null;
    const btn = el("button", {
      type: "button",
      class: "ctx-item" + (item.danger ? " danger" : ""),
      role: checkable ? "menuitemcheckbox" : "menuitem",
      "aria-checked": checkable ? String(!!item.checked) : null,
      "aria-disabled": item.disabled ? "true" : null,
      tabindex: "-1",
    },
      el("span", { class: "ctx-check", "aria-hidden": "true", text: item.checked ? "✓" : "" }),
      el("span", { class: "ctx-label", text: item.label }),
      item.hint ? el("kbd", { class: "ctx-hint", text: item.hint }) : null,
    );
    if (!item.disabled) btn.addEventListener("click", () => { close(); item.action(); });
    node.appendChild(btn);
  }
  return node;
}

function place(node, x, y) {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const w = node.offsetWidth;
  const h = node.offsetHeight;
  // Flip to the other side of the pointer when there is no room, then clamp.
  const left = x + w + MARGIN > vw ? x - w : x;
  const top = y + h + MARGIN > vh ? y - h : y;
  const cx = Math.max(MARGIN, Math.min(vw - w - MARGIN, left));
  const cy = Math.max(MARGIN, Math.min(vh - h - MARGIN, top));
  node.style.left = cx + "px";
  node.style.top = cy + "px";
  node.style.transformOrigin = `${x - cx}px ${y - cy}px`;
}

function onKey(e) {
  if (!menu) return;
  const handlers = {
    Escape: () => close({ restore: true }),
    Tab: () => close({ restore: true }),
    ArrowDown: () => focusItem(1),
    ArrowUp: () => focusItem(-1),
    Home: () => focusItem(0, 0),
    End: () => focusItem(0, -1),
  };
  const fn = handlers[e.key];
  if (!fn) return;
  e.preventDefault();
  e.stopPropagation();
  fn();
}

export function initContextMenu(resolve) {
  document.addEventListener("contextmenu", e => {
    // Shift + right-click always gets the native menu.
    if (e.shiftKey) { close(); return; }
    if (menu?.contains(e.target)) { e.preventDefault(); return; }
    const items = resolve(e.target);
    if (!items?.length) { close(); return; }
    e.preventDefault();
    close();

    // The context-menu key and Shift+F10 fire with no pointer position, so
    // anchor on the focused element instead.
    const fromKeyboard = e.button !== 2 && e.clientX === 0 && e.clientY === 0;
    let x = e.clientX, y = e.clientY;
    if (fromKeyboard) {
      const r = e.target.getBoundingClientRect();
      x = r.left + Math.min(r.width / 2, 24);
      y = r.bottom;
    }

    returnFocus = document.activeElement;
    menu = build(items);
    document.body.appendChild(menu);
    place(menu, x, y);
    menuIn(menu);
    if (fromKeyboard) focusItem(0, 0); else menu.focus({ preventScroll: true });
  });

  document.addEventListener("pointerdown", e => { if (menu && !menu.contains(e.target)) close(); }, true);
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("scroll", () => close(), true);
  window.addEventListener("resize", () => close());
  window.addEventListener("blur", () => close());
}

export const closeContextMenu = close;
