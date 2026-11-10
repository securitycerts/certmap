#!/usr/bin/env node
// Renders the favicon set from the header mark. Dev-only (Playwright): run
// `npm run favicon` if the mark changes and commit the output.
//
//   favicon.svg                    the mark itself, used by modern browsers
//   favicon.ico                    16, 32 and 48 px, for everything else
//   favicon-96x96.png              high-density tab icon
//   apple-touch-icon.png           180 px, opaque, for iOS home screens
//   web-app-manifest-{192,512}.png maskable, with the mark inside the safe zone

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "favicon");
const BG = "#13171f", EDGE = "#2e3645", DOT = "#2e3645", LINE = "#8aa9d4", GOAL = "#a8c1e6";

// The same staircase as the header logo: three nodes climbing a grid. Strokes
// are a little heavier than in the header so the shape survives at 16 px.
const MARK = `
  <g fill="${DOT}"><circle cx="9" cy="9" r="1.5"/><circle cx="16" cy="9" r="1.5"/><circle cx="9" cy="16" r="1.5"/><circle cx="23" cy="16" r="1.5"/><circle cx="16" cy="23" r="1.5"/><circle cx="23" cy="23" r="1.5"/></g>
  <path d="M9 23H16V16H23V9" fill="none" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="9" cy="23" r="2.7" fill="${LINE}"/>
  <circle cx="16" cy="16" r="2.2" fill="${LINE}"/>
  <circle cx="23" cy="9" r="3.5" fill="${GOAL}"/>`;

// rounded: a tile with transparent corners. Otherwise a full square, with the
// mark scaled down so a launcher can crop it to a circle without cutting it.
function svg({ rounded, scale = 1 }) {
  const shift = 16 * (1 - scale);
  const tile = rounded
    ? `<rect x=".5" y=".5" width="31" height="31" rx="7.5" fill="${BG}" stroke="${EDGE}"/>`
    : `<rect width="32" height="32" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${tile}<g transform="translate(${shift} ${shift}) scale(${scale})">${MARK}</g></svg>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function png(size, options) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(options)}`);
  return page.screenshot({ omitBackground: true });
}

// An .ico is a small directory followed by the images; PNG payloads are allowed.
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const at = 6 + 16 * i;
    header.writeUInt8(size, at); header.writeUInt8(size, at + 1);
    header.writeUInt16LE(1, at + 4); header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(data.length, at + 8); header.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(i => i.data)]);
}

writeFileSync(join(OUT, "favicon.svg"), svg({ rounded: true }) + "\n");
writeFileSync(join(OUT, "favicon-96x96.png"), await png(96, { rounded: true }));
writeFileSync(join(OUT, "apple-touch-icon.png"), await png(180, { rounded: false, scale: 0.82 }));
writeFileSync(join(OUT, "web-app-manifest-192x192.png"), await png(192, { rounded: false, scale: 0.66 }));
writeFileSync(join(OUT, "web-app-manifest-512x512.png"), await png(512, { rounded: false, scale: 0.66 }));
const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) images.push({ size, data: await png(size, { rounded: true }) });
writeFileSync(join(OUT, "favicon.ico"), ico(images));
await browser.close();
console.log("OK: favicon.svg, favicon.ico (16/32/48), favicon-96x96.png, apple-touch-icon.png, web-app-manifest-192/512.");
