// Graph view of a roadmap, drawn with React Flow. The library (React included)
// is a vendored bundle that is only fetched the first time someone opens this
// view, so the matrix and the list never pay for it.

import { fmtLocalPrice } from "./format.js?v=960c8ce7";
import { NOTE_MAX, STICKY_MAX, STICKY_LIMIT } from "./paths.js?v=960c8ce7";

const LEVELS = ["beginner", "intermediate", "advanced", "expert"];
const COL_W = 300, ROW_H = 190;

// The bundle carries the same version as this module, so a new deploy never
// pairs fresh code with a cached old bundle.
const VER = (v => (v ? "?v=" + v : ""))(new URL(import.meta.url).searchParams.get("v"));
let lib = null;
let root = null;

async function load() {
  if (lib) return lib;
  if (!document.querySelector("link[data-reactflow]")) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("../vendor/reactflow.css" + VER, import.meta.url).href;
    link.dataset.reactflow = "";
    document.head.appendChild(link);
  }
  lib = await import("../vendor/graph.bundle.js" + VER);
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
function layout(certs, L, perRow, theme) {
  const nodes = certs.map((c, i) => ({
    id: c.id,
    type: "cert",
    position: { x: (i % perRow) * COL_W, y: Math.floor(i / perRow) * ROW_H },
    data: { cert: c, step: i + 1 },
  }));

  // Edges leave from the side when the next step is beside them, and from the
  // bottom with a curve when they go to another row, so lines never run along
  // the same track or under a card. Arrowheads take the colour of their line.
  const dark = theme !== "light";
  const color = { req: dark ? "#8aa9d4" : "#3f6ea4", next: dark ? "#4a5468" : "#aab2c0" };
  const marker = kind => ({ type: L.MarkerType.ArrowClosed, width: 14, height: 14, color: color[kind] });
  const at = new Map(certs.map((c, i) => [c.id, { row: Math.floor(i / perRow), col: i % perRow }]));
  const edge = (kind, a, b) => {
    const A = at.get(a), B = at.get(b);
    const base = { id: `${kind}-${a}-${b}`, source: a, target: b, className: "gedge-" + kind, markerEnd: marker(kind) };
    if (A.row === B.row && B.col === A.col + 1) return { ...base, type: "straight", sourceHandle: "r", targetHandle: "l" };
    if (A.row === B.row) return { ...base, type: "default", sourceHandle: "b", targetHandle: "bt" };
    return { ...base, type: "default", sourceHandle: "b", targetHandle: "t" };
  };
  const inPath = new Set(certs.map(c => c.id));
  const edges = [];
  const hasReq = new Set();
  for (const c of certs) {
    for (const p of c.prerequisites) {
      if (!inPath.has(p)) continue;
      hasReq.add(c.id);
      edges.push(edge("req", p, c.id));
    }
  }
  // The suggested order only where no prerequisite already leads into the step.
  for (let i = 0; i < certs.length - 1; i++) {
    const b = certs[i + 1].id;
    if (!hasReq.has(b)) edges.push(edge("next", certs[i].id, b));
  }
  return { nodes, edges };
}

export async function mountGraph(host, { certs, notes, stickies = [], editable, theme, onOpen, onNote, onRemove, onStickies }) {
  let L;
  try { L = await load(); }
  catch { host.textContent = "The graph view could not be loaded."; return; }
  if (!host.isConnected) return;
  const h = L.createElement;

  const CertNode = L.memo(({ data }) => {
    const c = data.cert;
    const note = notes.get(c.id) || "";
    return h("div", { className: "gnode", "data-level": c.level },
      h(L.Handle, { type: "target", id: "l", position: L.Position.Left, isConnectable: false }),
      h(L.Handle, { type: "target", id: "t", position: L.Position.Top, isConnectable: false }),
      h(L.Handle, { type: "target", id: "bt", position: L.Position.Bottom, isConnectable: false }),
      h("div", { className: "gnode-top" },
        h("span", { className: "gnode-step" }, `Step ${data.step}`),
        editable ? h("button", { type: "button", className: "gnode-x nodrag", title: "Remove from roadmap", "aria-label": `Remove ${c.acronym}`, onClick: () => onRemove(c.id) }, "×") : null,
        h("button", { type: "button", className: "gnode-open nodrag", title: "Open details", "aria-label": `Open ${c.acronym}`, onClick: () => onOpen(c.id) }, "↗"),
      ),
      h("div", { className: "gnode-acro" }, c.acronym),
      h("div", { className: "gnode-meta" }, `${c.vendor} · ${fmtLocalPrice(c)}`),
      editable
        ? h("input", {
            className: "gnode-note nodrag", type: "text", maxLength: NOTE_MAX, defaultValue: note,
            placeholder: "Add a note", "aria-label": `Note for ${c.acronym}`,
            onChange: e => onNote(c.id, e.target.value),
          })
        : (note ? h("div", { className: "gnode-note" }, note) : null),
      h(L.Handle, { type: "source", id: "r", position: L.Position.Right, isConnectable: false }),
      h(L.Handle, { type: "source", id: "b", position: L.Position.Bottom, isConnectable: false }),
    );
  });
  // Free notes on the canvas. Each keeps its own text; the list is handed back
  // to the app (which stores it and puts it in the link) whenever one changes.
  let current = stickies.map((s, i) => ({ ...s, id: "sticky-" + i }));
  const emit = () => onStickies?.(current.map(({ x, y, text }) => ({ x, y, text })));
  const StickyNode = L.memo(({ id, data }) => {
    const remove = () => { current = current.filter(s => s.id !== id); data.drop(id); emit(); };
    return h("div", { className: "gsticky" + (editable ? "" : " readonly") },
      editable ? h("button", { type: "button", className: "gsticky-x nodrag", title: "Delete note", "aria-label": "Delete note", onClick: remove }, "×") : null,
      editable
        ? h("textarea", {
            className: "gsticky-text nodrag nowheel", maxLength: STICKY_MAX, defaultValue: data.text, rows: 4,
            placeholder: "Write a note for whoever you share this with", "aria-label": "Sticky note",
            onChange: e => { const s = current.find(n => n.id === id); if (s) { s.text = e.target.value; emit(); } },
          })
        : h("div", { className: "gsticky-text" }, data.text),
    );
  });
  const nodeTypes = { cert: CertNode, sticky: StickyNode };
  // As many steps per row as fit the panel at a readable size.
  const perRow = Math.max(2, Math.min(5, Math.floor(host.clientWidth / COL_W) || 3));
  const initial = layout(certs, L, perRow, theme);
  // Tall enough for its rows and no taller, so a short path is not a small
  // island in a large empty panel.
  const rows = Math.ceil(certs.length / perRow);
  host.style.height = Math.min(Math.round(window.innerHeight * 0.72), Math.max(300, rows * ROW_H + 110)) + "px";

  const stickyNode = (s, drop) => ({ id: s.id, type: "sticky", position: { x: s.x, y: s.y }, data: { text: s.text, drop }, draggable: editable, selectable: editable, zIndex: 5 });

  function AddSticky({ setNodes }) {
    const flow = L.useReactFlow();
    if (!editable) return null;
    const full = current.length >= STICKY_LIMIT;
    return h(L.Panel, { position: "top-right" },
      h("button", {
        type: "button", className: "gsticky-add", disabled: full,
        title: full ? `Up to ${STICKY_LIMIT} notes` : "Add a sticky note to the graph",
        onClick: () => {
          const box = host.getBoundingClientRect();
          const p = flow.screenToFlowPosition({ x: box.left + box.width / 2 - 110, y: box.top + 40 });
          const s = { id: "sticky-" + Date.now(), x: Math.round(p.x), y: Math.round(p.y), text: "" };
          current = [...current, s];
          setNodes(ns => [...ns, stickyNode(s, drop)]);
          emit();
          requestAnimationFrame(() => host.querySelector(`[data-id="${s.id}"] textarea`)?.focus());
        },
      }, "+ Sticky note"));
  }
  let drop = () => {};

  function Graph() {
    const [nodes, setNodes, onNodesChange] = L.useNodesState([...initial.nodes, ...current.map(s => stickyNode(s, id => drop(id)))]);
    drop = id => setNodes(ns => ns.filter(n => n.id !== id));
    // Keep the stored position of a note in step when it is dragged.
    const onNodeDragStop = (e, node) => {
      const s = current.find(n => n.id === node.id);
      if (s) { s.x = Math.round(node.position.x); s.y = Math.round(node.position.y); emit(); }
    };
    const [edges] = L.useEdgesState(initial.edges);
    return h(L.ReactFlow, {
      nodes, edges, onNodesChange, nodeTypes, onNodeDragStop,
      colorMode: theme,
      fitView: true,
      fitViewOptions: { padding: 0.12, maxZoom: 1 },
      minZoom: 0.3, maxZoom: 1.6,
      nodesConnectable: false,
      deleteKeyCode: null,
      zoomOnScroll: false,
      zoomOnDoubleClick: false,
      preventScrolling: false,
      // React Flow (MIT) is credited in the README instead of on the canvas.
      proOptions: { hideAttribution: true },
      onNodeDoubleClick: (e, node) => { if (node.type === "cert" && !e.target.closest("input, button, textarea")) onOpen(node.id); },
    },
      h(L.Background, { gap: 22, size: 1 }),
      h(L.Controls, { showInteractive: false }),
      h(AddSticky, { setNodes }),
      
    );
  }

  unmountGraph();
  host.replaceChildren();
  root = L.createRoot(host);
  root.render(h(Graph));
}
