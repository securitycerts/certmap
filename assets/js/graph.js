// Graph view of a roadmap, drawn with React Flow. The library (React included)
// is a vendored bundle that is only fetched the first time someone opens this
// view, so the matrix and the list never pay for it.

import { fmtPrice } from "./format.js?v=9a0c9316";
import { NOTE_MAX } from "./paths.js?v=9a0c9316";

const LEVELS = ["beginner", "intermediate", "advanced", "expert"];
const COL_W = 280, ROW_H = 150;

let lib = null;
let root = null;

async function load() {
  if (lib) return lib;
  if (!document.querySelector("link[data-reactflow]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "assets/vendor/reactflow.css";
    link.dataset.reactflow = "";
    document.head.appendChild(link);
  }
  lib = await import("../vendor/graph.bundle.js");
  return lib;
}

export function unmountGraph() {
  root?.unmount();
  root = null;
}

// Steps read left to right in the order of the path and wrap into rows, like
// lines of text, so the eye never has to follow an arrow backwards. Solid
// arrows are real prerequisites; dashed ones only show the suggested order
// between two steps that do not depend on each other.
function layout(certs, L, perRow) {
  const nodes = certs.map((c, i) => ({
    id: c.id,
    type: "cert",
    position: { x: (i % perRow) * COL_W, y: Math.floor(i / perRow) * ROW_H },
    data: { cert: c, step: i + 1 },
  }));

  const inPath = new Set(certs.map(c => c.id));
  const arrow = { type: L.MarkerType.ArrowClosed, width: 18, height: 18 };
  const edges = [];
  const linked = new Set();
  for (const c of certs) {
    for (const p of c.prerequisites) {
      if (!inPath.has(p)) continue;
      linked.add(p + ">" + c.id);
      edges.push({ id: `req-${p}-${c.id}`, source: p, target: c.id, type: "smoothstep", className: "gedge-req", markerEnd: arrow });
    }
  }
  for (let i = 0; i < certs.length - 1; i++) {
    const a = certs[i].id, b = certs[i + 1].id;
    if (linked.has(a + ">" + b)) continue;
    edges.push({ id: `next-${a}-${b}`, source: a, target: b, type: "smoothstep", className: "gedge-next", markerEnd: arrow });
  }
  return { nodes, edges };
}

export async function mountGraph(host, { certs, notes, editable, theme, onOpen, onNote }) {
  let L;
  try { L = await load(); }
  catch { host.textContent = "The graph view could not be loaded."; return; }
  if (!host.isConnected) return;
  const h = L.createElement;

  const CertNode = L.memo(({ data }) => {
    const c = data.cert;
    const note = notes.get(c.id) || "";
    return h("div", { className: "gnode", "data-level": c.level },
      h(L.Handle, { type: "target", position: L.Position.Left, isConnectable: false }),
      h("div", { className: "gnode-top" },
        h("span", { className: "gnode-step" }, `Step ${data.step}`),
        h("button", { type: "button", className: "gnode-open nodrag", title: "Open details", "aria-label": `Open ${c.acronym}`, onClick: () => onOpen(c.id) }, "↗"),
      ),
      h("div", { className: "gnode-acro" }, c.acronym),
      h("div", { className: "gnode-meta" }, `${c.vendor} · ${fmtPrice(c.price_usd)}`),
      editable
        ? h("input", {
            className: "gnode-note nodrag", type: "text", maxLength: NOTE_MAX, defaultValue: note,
            placeholder: "Add a note", "aria-label": `Note for ${c.acronym}`,
            onChange: e => onNote(c.id, e.target.value),
          })
        : (note ? h("div", { className: "gnode-note" }, note) : null),
      h(L.Handle, { type: "source", position: L.Position.Right, isConnectable: false }),
    );
  });
  const nodeTypes = { cert: CertNode };
  // As many steps per row as fit the panel at a readable size.
  const perRow = Math.max(2, Math.min(5, Math.floor(host.clientWidth / COL_W) || 3));
  const initial = layout(certs, L, perRow);
  // Tall enough for its rows and no taller, so a short path is not a small
  // island in a large empty panel.
  const rows = Math.ceil(certs.length / perRow);
  host.style.height = Math.min(Math.round(window.innerHeight * 0.72), Math.max(300, rows * ROW_H + 110)) + "px";

  function Graph() {
    const [nodes, , onNodesChange] = L.useNodesState(initial.nodes);
    const [edges] = L.useEdgesState(initial.edges);
    return h(L.ReactFlow, {
      nodes, edges, onNodesChange, nodeTypes,
      colorMode: theme,
      fitView: true,
      fitViewOptions: { padding: 0.12, maxZoom: 1 },
      minZoom: 0.3, maxZoom: 1.6,
      nodesConnectable: false,
      deleteKeyCode: null,
      zoomOnScroll: false,
      zoomOnDoubleClick: false,
      preventScrolling: false,
      onNodeDoubleClick: (e, node) => { if (!e.target.closest("input, button")) onOpen(node.id); },
    },
      h(L.Background, { gap: 22, size: 1 }),
      h(L.Controls, { showInteractive: false }),
      
    );
  }

  unmountGraph();
  host.replaceChildren();
  root = L.createRoot(host);
  root.render(h(Graph));
}
