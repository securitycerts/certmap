// Short confirmation messages ("Link copied"). The host is an aria-live region
// so screen readers announce them too.

import { el } from "./dom.js?v=7464e860";
import { toastIn, toastOut } from "./motion.js?v=7464e860";

const LIFETIME = 2200;
let host = null;

function ensureHost() {
  if (host) return host;
  host = el("div", { class: "toasts", role: "status", "aria-live": "polite" });
  document.body.appendChild(host);
  return host;
}

export function toast(message, { tone = "ok" } = {}) {
  const node = el("div", { class: `toast toast-${tone}`, text: message });
  ensureHost().appendChild(node);
  while (host.children.length > 3) host.firstChild.remove();
  toastIn(node);
  setTimeout(() => toastOut(node, () => node.remove()), LIFETIME);
}

// Clipboard writes fail on insecure origins and when the page is not focused;
// say so instead of pretending the copy worked.
export async function copyText(text, okMessage = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
    return true;
  } catch {
    toast("Could not access the clipboard", { tone: "warn" });
    return false;
  }
}
