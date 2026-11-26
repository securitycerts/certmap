// Draws the QR code of the donation address (data/donate.json) as an SVG at
// assets/donate-qr.svg. Wallets such as Zodl warn when a payment request
// arrives from another app, and ask to scan it with their own camera instead,
// so the donation page shows this code next to the address.
//
// Dev-only (it needs the qrcode package): run `npm run qr` after changing the
// address and commit the SVG. The page build only links to the file.

import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "donate-qr.svg");
const address = String(JSON.parse(readFileSync(join(ROOT, "data", "donate.json"), "utf8")).zcash || "").trim();

if (!address) {
  rmSync(OUT, { force: true });
  console.log("No address in data/donate.json; no QR code.");
} else {
  // ZIP-321 payment URI. Dark modules on a white field, as cameras expect.
  const svg = await QRCode.toString(`zcash:${address}`, {
    type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#0b0d12", light: "#ffffff" },
  });
  writeFileSync(OUT, svg.replace("<svg ", '<svg role="img" aria-label="QR code of the cert/map Zcash donation address" '));
  console.log("OK: assets/donate-qr.svg");
}
