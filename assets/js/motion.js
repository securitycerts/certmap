// Motion layer. Every animation on the page goes through here so there is one
// place that honours prefers-reduced-motion and one place that cleans up the
// inline styles anime.js leaves behind (a leftover inline transform would
// otherwise beat the :hover rules in the stylesheet).
//
// anime.js is vendored in assets/vendor so the site keeps its no-build,
// same-origin-only setup (see the Content-Security-Policy in index.html).

import { animate, stagger, utils, svg } from "../vendor/anime.esm.min.js?v=7fca6d4a";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
export const motionOK = () => !reduced.matches;

const EASE_OUT = "outExpo";
const EASE_IN = "inQuad";

function clear(nodes, ...props) {
  for (const n of nodes) for (const p of props) n.style.removeProperty(p);
}

const list = t => (t instanceof Element ? [t] : Array.from(t || []));

// Entrance for a freshly painted set of cards. The total stagger is capped so a
// 250-pill matrix settles as fast as a 10-card result list.
export function staggerIn(targets, { y = 6, span = 260, duration = 320 } = {}) {
  const nodes = list(targets);
  if (!nodes.length || !motionOK()) return;
  animate(nodes, {
    opacity: [0, 1],
    translateY: [y, 0],
    duration,
    delay: stagger([0, Math.min(span, nodes.length * 14)]),
    ease: EASE_OUT,
    onComplete: () => clear(nodes, "opacity", "transform"),
  });
}

// Short scale bump used when a cert is added to or removed from the selection.
export function pop(targets, amount = 1.07) {
  const nodes = list(targets);
  if (!nodes.length || !motionOK()) return;
  utils.remove(nodes);
  animate(nodes, {
    scale: [1, amount, 1],
    duration: 280,
    ease: "outQuad",
    onComplete: () => clear(nodes, "transform"),
  });
}

// Show/hide helpers for the panels that used to rely on CSS keyframes. Each
// panel keeps a token so a close that is still running cannot hide a panel that
// has been reopened in the meantime.
const tokens = new WeakMap();
const bump = node => { const t = (tokens.get(node) || 0) + 1; tokens.set(node, t); return t; };

const closing = new WeakSet();

function reveal(node, from, duration) {
  const wasHidden = node.classList.contains("hidden");
  const wasClosing = closing.has(node);
  // Already open and at rest: nothing to do, and nothing to interrupt.
  if (!wasHidden && !wasClosing) return;
  bump(node);
  closing.delete(node);
  utils.remove(node);
  node.classList.remove("hidden");
  node.setAttribute("aria-hidden", "false");
  if (!motionOK()) { clear([node], "opacity", "transform"); return; }
  // Reopened mid-close: carry on from wherever the panel currently is.
  const props = wasClosing
    ? Object.fromEntries(Object.entries(from).map(([k, v]) => [k, v[1]]))
    : from;
  animate(node, { ...props, duration, ease: EASE_OUT, onComplete: () => clear([node], "opacity", "transform") });
}

function dismiss(node, to, duration, done) {
  if (node.classList.contains("hidden")) return;
  const token = bump(node);
  closing.add(node);
  const finish = () => {
    if (tokens.get(node) !== token) return;
    closing.delete(node);
    node.classList.add("hidden");
    node.setAttribute("aria-hidden", "true");
    clear([node], "opacity", "transform");
    done?.();
  };
  utils.remove(node);
  if (!motionOK()) { finish(); return; }
  animate(node, { ...to, duration, ease: EASE_IN, onComplete: finish });
}

export const drawerIn = node => reveal(node, { translateX: ["100%", "0%"] }, 380);
export const drawerOut = (node, done) => dismiss(node, { translateX: "100%" }, 200, done);
export const panelIn = node => reveal(node, { opacity: [0, 1], translateY: [14, 0] }, 260);
export const panelOut = (node, done) => dismiss(node, { opacity: 0, translateY: 10 }, 150, done);

// Menus and dialogs grow out of the point they were opened from.
export function menuIn(node) {
  if (!motionOK()) return;
  animate(node, {
    opacity: [0, 1],
    scale: [0.96, 1],
    duration: 160,
    ease: "outQuad",
    onComplete: () => clear([node], "opacity", "transform"),
  });
  const items = node.querySelectorAll("[role^='menuitem']");
  if (items.length) {
    animate(items, {
      opacity: [0, 1],
      translateX: [-4, 0],
      duration: 180,
      delay: stagger(14),
      ease: "outQuad",
      onComplete: () => clear(items, "opacity", "transform"),
    });
  }
}

// Fade the content of a container in, top to bottom (drawer body, help dialog).
export function cascade(container, { step = 22, y = 8 } = {}) {
  const nodes = Array.from(container.children);
  if (!nodes.length || !motionOK()) return;
  utils.remove(nodes);
  animate(nodes, {
    opacity: [0, 1],
    translateY: [y, 0],
    duration: 360,
    delay: stagger(step, { start: 60 }),
    ease: EASE_OUT,
    onComplete: () => clear(nodes, "opacity", "transform"),
  });
}

// Count a number up or down in place. `paint` receives the rounded value.
const counters = new WeakMap();
export function tweenNumber(node, to, paint) {
  const state = counters.get(node) || { value: to };
  counters.set(node, state);
  if (!motionOK() || state.value === to) { state.value = to; paint(to); return; }
  utils.remove(state);
  animate(state, {
    value: to,
    duration: 520,
    ease: EASE_OUT,
    onUpdate: () => paint(Math.round(state.value)),
    onComplete: () => { state.value = to; paint(to); },
  });
}

export function spin(node) {
  if (!node || !motionOK()) return;
  utils.remove(node);
  animate(node, { rotate: [0, 360], duration: 520, ease: EASE_OUT, onComplete: () => clear([node], "transform") });
}

export function toastIn(node) {
  if (!motionOK()) return;
  animate(node, { opacity: [0, 1], translateY: [10, 0], duration: 240, ease: EASE_OUT });
}

export function toastOut(node, done) {
  if (!motionOK()) { done(); return; }
  animate(node, { opacity: 0, translateY: 6, duration: 180, ease: EASE_IN, onComplete: done });
}

// Header mark: the path draws itself from the first node to the goal, then the
// nodes land along it.
export function logoIntro(logo) {
  if (!logo || !motionOK()) return;
  const path = logo.querySelector(".logo-path");
  const nodes = logo.querySelectorAll(".logo-node");
  animate(svg.createDrawable(path), { draw: ["0 0", "0 1"], duration: 900, delay: 150, ease: "inOutQuad" });
  animate(nodes, {
    scale: [0, 1],
    duration: 520,
    delay: stagger(260, { start: 150 }),
    ease: "outBack",
    onComplete: () => clear(nodes, "transform"),
  });
}
