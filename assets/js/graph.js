// Graph view of a roadmap, drawn with React Flow. The library (React included)
// is a vendored bundle that is only fetched the first time someone opens this
// view, so the matrix and the list never pay for it.

import { fmtPrice } from "./format.js?v=5a251008";
import { NOTE_MAX } from "./paths.js?v=5a251008";

const LEVELS = ["beginner", "intermediate", "advanced", "expert"];
const COL_W = 290, ROW_H = 132;

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

// Columns are seniority levels, left to right; within a column certs keep the
// order of the path. Solid edges are real prerequisites, dashed ones only show
// the suggested order between steps that do not depend on each other.
function layout(certs, L) {
  const cols = LEVELS.filter(l => certs.some(c => c.level === l));
  const tallest = Math.max(...cols.map(l => certs.filter(c => c.level === l).length));
  const nodes = certs.map((c, i) => {
    const col = cols.indexOf(c.level);
    const siblings = certs.filter(o => o.level === c.level);
    const row = siblings.indexOf(c);
    return {
      id: c.id,
      type: "cert",
      position: { x: col * COL_W, y: (row + (tallest - siblings.length) / 2) * ROW_H },
      data: { cert: c, step: i + 1 },
    };
  });

  const inPath = new Set(certs.map(c => c.id));
  const edges = [];
  const linked = new Set();
  for (const c of certs) {
    for (const p of c.prerequisites) {
      if (!inPath.has(p)) continue;
      linked.add(p + ">" + c.id);
      edges.push({
        id: `req-${p}-${c.id}`, source: p, target: c.id, type: "smoothstep", className: "gedge-req",
        markerEnd: { type: L.MarkerType.ArrowClosed },
      });
    }
  }
  for (let i = 0; i < certs.length - 1; i++) {
    const a = certs[i].id, b = certs[i + 1].id;
    if (linked.has(a + ">" + b)) continue;
    edges.push({ id: `next-${a}-${b}`, source: a, target: b, type: "smoothstep", className: "gedge-next", animated: true });
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
  const initial = layout(certs, L);

  function Graph() {
    const [nodes, , onNodesChange] = L.useNodesState(initial.nodes);
    const [edges] = L.useEdgesState(initial.edges);
    return h(L.ReactFlow, {
      nodes, edges, onNodesChange, nodeTypes,
      colorMode: theme,
      fitView: true,
      fitViewOptions: { padding: 0.18, maxZoom: 1.1 },
      minZoom: 0.25, maxZoom: 1.8,
      nodesConnectable: false,
      deleteKeyCode: null,
      elementsSelectable: true,
      onNodeDoubleClick: (_e, node) => onOpen(node.id),
    },
      h(L.Background, { gap: 22, size: 1 }),
      h(L.Controls, { showInteractive: false }),
      certs.length > 6 ? h(L.MiniMap, { pannable: true, zoomable: true }) : null,
    );
  }

  unmountGraph();
  host.replaceChildren();
  root = L.createRoot(host);
  root.render(h(Graph));
}
