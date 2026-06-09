// Small element builders so the renderers can assemble nodes without ever
// touching innerHTML. Building in code means a cert's name, description or vendor
// is always set as text and can never be interpreted as markup, so there is no
// HTML-injection surface to keep escaping by hand.

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "checked") node.checked = !!v;
    else if (k === "value") node.value = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  append(node, children);
  return node;
}

function append(node, child) {
  if (child == null || child === false) return;
  if (Array.isArray(child)) { for (const c of child) append(node, c); return; }
  node.append(child instanceof Node ? child : document.createTextNode(String(child)));
}

const SVG_NS = "http://www.w3.org/2000/svg";

// Build an inline SVG from a plain attribute object plus a list of child shape
// descriptors ({ tag: "path", d: "..." }). Used for the few small glyphs the
// renderers draw; page-level icons live as static markup in index.html.
export function svg(attrs = {}, ...shapes) {
  const node = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const shape of shapes) {
    const { tag = "path", ...rest } = shape;
    const child = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(rest)) child.setAttribute(k, v);
    node.appendChild(child);
  }
  return node;
}
