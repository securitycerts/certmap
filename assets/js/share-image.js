// Draws a roadmap as a picture of its graph so it can be saved and attached to
// a post or a message. Link previews cannot be generated per roadmap on a
// static host (the path lives in the URL fragment, which preview crawlers never
// see), so this is the image people can share by hand.
//
// The layout matches the graph view: steps read left to right and wrap into
// rows, solid arrows are prerequisites and dashed ones the suggested order.
// The canvas is drawn at twice its size so it stays sharp on any screen.

import { fmtLocalPrice } from "./format.js?v=960c8ce7";
import { pathSummary } from "./paths.js?v=960c8ce7";

const LEVEL_COLOR = { beginner: "#4f7a63", intermediate: "#5b6e96", advanced: "#846a99", expert: "#9a6e6e" };
const LEVEL_LABEL = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", expert: "Expert" };
const C = { bg: "#0b0d12", panel: "#13171f", border: "#232a37", strong: "#2e3645", text: "#e6e8ec", dim: "#b3b9c5", muted: "#7d8595", accent: "#8aa9d4", dot: "#1b2130" };
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SANS = '-apple-system, "Segoe UI", Inter, Roboto, sans-serif';

const W = 1600, PAD = 72, PER_ROW = 4, GAP_X = 56, GAP_Y = 70;
const NODE_W = (W - PAD * 2 - GAP_X * (PER_ROW - 1)) / PER_ROW;
const NODE_H = 150, NOTE_H = 34, SCALE = 2;

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function arrowHead(ctx, x, y, dir, color) {
  const s = 9;
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.rotate(dir);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-s * 1.4, -s * 0.75); ctx.lineTo(-s * 1.4, s * 0.75); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// The cert/map mark: a rounded tile, a dotted grid and the path to the goal.
function drawLogo(ctx, x, y, size) {
  const k = size / 32;
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  ctx.fillStyle = "#151a24"; ctx.strokeStyle = C.strong; ctx.lineWidth = 1 / k;
  ctx.beginPath(); ctx.roundRect(1, 1, 30, 30, 8); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#3a4458";
  for (const [cx, cy] of [[9, 9], [16, 9], [9, 16], [23, 16], [16, 23], [23, 23]]) { ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = C.accent; ctx.lineWidth = 2.4; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.beginPath(); ctx.moveTo(9, 23); ctx.lineTo(16, 23); ctx.lineTo(16, 16); ctx.lineTo(23, 16); ctx.lineTo(23, 9); ctx.stroke();
  ctx.fillStyle = C.accent;
  for (const [cx, cy, r] of [[9, 23, 2.2], [16, 16, 1.8], [23, 9, 3]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function wordmark(ctx, x, y, px) {
  ctx.font = `700 ${px}px ${MONO}`;
  const parts = [["cert", C.text], ["/", C.accent], ["map", C.text]];
  for (const [t, color] of parts) { ctx.fillStyle = color; ctx.fillText(t, x, y); x += ctx.measureText(t).width; }
  return x;
}

export function drawRoadmap(certs, name, notes = new Map()) {
  const hasNotes = certs.some(c => (notes.get?.(c.id) || "").trim());
  const nodeH = NODE_H + (hasNotes ? NOTE_H : 0);
  const rows = Math.max(1, Math.ceil(certs.length / PER_ROW));
  const top = 250, footer = 120;
  const H = top + rows * nodeH + (rows - 1) * GAP_Y + footer;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext("2d");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "alphabetic";

  // background with the same dotted grid as the graph view
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.dot;
  for (let gx = 22; gx < W; gx += 22) for (let gy = 22; gy < H; gy += 22) ctx.fillRect(gx, gy, 1.4, 1.4);

  // title
  ctx.font = `600 15px ${SANS}`; ctx.fillStyle = C.accent;
  ctx.fillText("CERTIFICATION ROADMAP", PAD, 92);
  ctx.font = `700 56px ${SANS}`; ctx.fillStyle = C.text;
  ctx.fillText(fit(ctx, name || "My certification roadmap", W - PAD * 2), PAD, 156);
  ctx.font = `400 22px ${SANS}`; ctx.fillStyle = C.dim;
  ctx.fillText(fit(ctx, pathSummary(certs), W - PAD * 2), PAD, 196);

  const pos = new Map(certs.map((c, i) => [c.id, {
    x: PAD + (i % PER_ROW) * (NODE_W + GAP_X),
    y: top + Math.floor(i / PER_ROW) * (nodeH + GAP_Y),
  }]));
  const right = p => [p.x + NODE_W, p.y + NODE_H / 2];
  const left = p => [p.x, p.y + NODE_H / 2];

  // edges first, so the cards sit on top of them
  const inPath = new Set(certs.map(c => c.id));
  const linked = new Set();
  const edge = (a, b, solid) => {
    const pa = pos.get(a), pb = pos.get(b);
    ctx.save();
    ctx.strokeStyle = solid ? C.accent : C.strong;
    ctx.lineWidth = solid ? 2.2 : 1.8;
    if (!solid) ctx.setLineDash([7, 6]);
    ctx.beginPath();
    let end, dir;
    if (pa.y === pb.y && pb.x > pa.x) {
      const [x1, y1] = right(pa), [x2, y2] = left(pb);
      ctx.moveTo(x1, y1); ctx.lineTo(x2 - 2, y2); end = [x2, y2]; dir = 0;
    } else {
      // to a later row: out of the bottom, across, into the top
      const x1 = pa.x + NODE_W / 2, y1 = pa.y + nodeH, x2 = pb.x + NODE_W / 2, y2 = pb.y;
      const mid = y1 + (y2 - y1) / 2;
      ctx.moveTo(x1, y1); ctx.lineTo(x1, mid); ctx.lineTo(x2, mid); ctx.lineTo(x2, y2 - 2);
      end = [x2, y2]; dir = Math.PI / 2;
    }
    ctx.stroke();
    ctx.restore();
    arrowHead(ctx, end[0], end[1], dir, solid ? C.accent : C.strong);
  };
  for (const c of certs) for (const p of c.prerequisites || []) if (inPath.has(p)) { linked.add(p + ">" + c.id); edge(p, c.id, true); }
  for (let i = 0; i < certs.length - 1; i++) if (!linked.has(certs[i].id + ">" + certs[i + 1].id)) edge(certs[i].id, certs[i + 1].id, false);

  // cards
  certs.forEach((c, i) => {
    const { x, y } = pos.get(c.id);
    const color = LEVEL_COLOR[c.level] || C.accent;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    ctx.fillStyle = C.panel; ctx.beginPath(); ctx.roundRect(x, y, NODE_W, nodeH, 14); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = C.border; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, NODE_W, nodeH, 14); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, NODE_W, 5, [14, 14, 0, 0]); ctx.fill();

    ctx.font = `600 13px ${SANS}`; ctx.fillStyle = C.muted;
    ctx.fillText(`STEP ${i + 1}`, x + 20, y + 34);
    ctx.textAlign = "right"; ctx.fillStyle = color;
    ctx.fillText(LEVEL_LABEL[c.level] || "", x + NODE_W - 20, y + 34); ctx.textAlign = "left";
    ctx.font = `700 28px ${MONO}`; ctx.fillStyle = C.text;
    ctx.fillText(fit(ctx, c.acronym, NODE_W - 40), x + 20, y + 72);
    ctx.font = `400 15px ${SANS}`; ctx.fillStyle = C.dim;
    ctx.fillText(fit(ctx, c.name, NODE_W - 40), x + 20, y + 98);
    ctx.font = `500 15px ${SANS}`; ctx.fillStyle = C.muted;
    ctx.fillText(fit(ctx, `${c.vendor} · ${fmtLocalPrice(c)}`, NODE_W - 40), x + 20, y + 128);
    const note = (notes.get?.(c.id) || "").trim();
    if (note) {
      ctx.strokeStyle = C.border; ctx.beginPath(); ctx.moveTo(x + 20, y + NODE_H); ctx.lineTo(x + NODE_W - 20, y + NODE_H); ctx.stroke();
      ctx.font = `italic 400 14px ${SANS}`; ctx.fillStyle = C.accent;
      ctx.fillText(fit(ctx, "✎ " + note, NODE_W - 40), x + 20, y + NODE_H + 23);
    }
  });

  // footer: the cert/map mark bottom left, the address bottom right
  const fy = H - 64;
  drawLogo(ctx, PAD, fy - 6, 40);
  ctx.textBaseline = "middle";
  const after = wordmark(ctx, PAD + 54, fy + 14, 22);
  ctx.font = `400 15px ${SANS}`; ctx.fillStyle = C.muted;
  ctx.fillText("Security certification roadmap", after + 14, fy + 15);
  ctx.textAlign = "right"; ctx.font = `500 18px ${SANS}`; ctx.fillStyle = C.dim;
  ctx.fillText("certmap.dev", W - PAD, fy + 14);
  ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  return canvas;
}

export function downloadRoadmapImage(certs, name, notes) {
  return new Promise(resolve => {
    drawRoadmap(certs, name, notes).toBlob(blob => {
      if (!blob) { resolve(false); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (name || "roadmap").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      resolve(true);
    }, "image/png");
  });
}
