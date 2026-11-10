// Draws a 1200x630 card of a roadmap on a canvas so it can be saved and
// attached to a post or a message. Link previews cannot be generated per
// roadmap on a static host (the path lives in the URL fragment, which preview
// crawlers never see), so this is the image people can share by hand.

import { fmtPrice } from "./format.js?v=cb08b99a";
import { pathSummary } from "./paths.js?v=cb08b99a";

const W = 1200, H = 630;
const LEVEL_COLOR = { beginner: "#4f7a63", intermediate: "#5b6e96", advanced: "#846a99", expert: "#9a6e6e" };
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SANS = '-apple-system, "Segoe UI", Inter, Roboto, sans-serif';

function fit(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

function box(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export function drawRoadmap(certs, name) {
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#0b0d12"; ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "alphabetic";
  ctx.font = `700 26px ${MONO}`;
  ctx.fillStyle = "#e6e8ec"; ctx.fillText("cert", 64, 78);
  const cw = ctx.measureText("cert").width;
  ctx.fillStyle = "#8aa9d4"; ctx.fillText("/", 64 + cw, 78);
  ctx.fillStyle = "#e6e8ec"; ctx.fillText("map", 64 + cw + ctx.measureText("/").width, 78);
  ctx.font = `500 20px ${SANS}`; ctx.fillStyle = "#7d8595"; ctx.textAlign = "right";
  ctx.fillText("certmap.dev", W - 64, 76); ctx.textAlign = "left";

  ctx.font = `700 56px ${SANS}`; ctx.fillStyle = "#e6e8ec";
  ctx.fillText(fit(ctx, name || "Certification roadmap", W - 128), 64, 168);
  ctx.font = `400 24px ${SANS}`; ctx.fillStyle = "#b3b9c5";
  ctx.fillText(fit(ctx, pathSummary(certs), W - 128), 64, 210);

  // Up to three rows of four steps; a longer path ends with a "+N more" tile.
  const cols = 4, gap = 16, bw = (W - 128 - gap * (cols - 1)) / cols, bh = 104, top = 252;
  const room = cols * 3;
  const shown = certs.length > room ? certs.slice(0, room - 1) : certs;
  shown.forEach((c, i) => {
    const x = 64 + (i % cols) * (bw + gap), y = top + Math.floor(i / cols) * (bh + gap);
    ctx.fillStyle = "#13171f"; box(ctx, x, y, bw, bh, 10); ctx.fill();
    ctx.strokeStyle = "#232a37"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = LEVEL_COLOR[c.level] || "#5b6e96"; box(ctx, x, y, 5, bh, [10, 0, 0, 10]); ctx.fill();
    ctx.font = `600 13px ${SANS}`; ctx.fillStyle = "#7d8595"; ctx.fillText(`STEP ${i + 1}`, x + 20, y + 28);
    ctx.font = `700 25px ${MONO}`; ctx.fillStyle = "#e6e8ec"; ctx.fillText(fit(ctx, c.acronym, bw - 40), x + 20, y + 60);
    ctx.font = `400 16px ${SANS}`; ctx.fillStyle = "#b3b9c5";
    ctx.fillText(fit(ctx, `${c.vendor} · ${fmtPrice(c.price_usd)}`, bw - 40), x + 20, y + 86);
  });
  if (shown.length < certs.length) {
    const i = shown.length, x = 64 + (i % cols) * (bw + gap), y = top + Math.floor(i / cols) * (bh + gap);
    ctx.strokeStyle = "#2e3645"; ctx.setLineDash([6, 6]); box(ctx, x, y, bw, bh, 10); ctx.stroke(); ctx.setLineDash([]);
    ctx.font = `600 24px ${SANS}`; ctx.fillStyle = "#8aa9d4"; ctx.textAlign = "center";
    ctx.fillText(`+${certs.length - shown.length} more`, x + bw / 2, y + bh / 2 + 8); ctx.textAlign = "left";
  }
  return canvas;
}

export function downloadRoadmapImage(certs, name) {
  return new Promise(resolve => {
    drawRoadmap(certs, name).toBlob(blob => {
      if (!blob) { resolve(false); return; }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (name || "roadmap").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + ".png";
      a.click();
      URL.revokeObjectURL(a.href);
      resolve(true);
    }, "image/png");
  });
}
