// Vendor logos. Each cert shows a small square that starts as the vendor's
// initial and upgrades to a real logo once it loads (and quietly stays the
// initial if the image fails). The matrix repaints all ~175 of these on every
// keystroke, so once a vendor's image has loaded we keep it around and hand back
// a cheap clone instead of building a fresh Image and re-running the load dance.

const VENDOR_IMAGE = {
  "comptia": "comptia.webp",
  "isc2": "isc2.webp",
  "isaca": "isaca.webp",
  "offsec": "offsec.webp",
  "giac": "giac.webp",
  "sans": "sans.webp",
  "ec-council": "eccouncil.webp",
  "zero-point security": "zero_point.webp",
  "tcm security": "tcm_security.webp",
  "hack the box": "hackthebox.webp",
  "ine": "ine.webp",
  "aws": "aws.webp",
  "microsoft": "microsoft.svg",
  "google": "google.webp",
  "cisco": "cisco.webp",
  "isa": "isa.webp",
  "opentext": "opentext.webp",
  "cellebrite": "cellebrite.webp",
  "magnet forensics": "magnetforensics.webp",
  "okta": "okta.webp",
  "sailpoint": "sailpoint.svg",
  "iapp": "iapp.webp",
  "lpi": "lpi.webp",
  "red hat": "redhat.webp",
  "splunk": "splunk.webp",
  "trm labs": "trm_labs.webp",
  "mcsi": "mosse.webp",
  "csa": "cloudsecurityalliance.webp",
  "mcafee institute": "mcafee.webp",
  "arcx": "arcx.webp",
  "crest": "crest.webp",
  "vmware": "vmware.webp",
  "fortinet": "fortinet.webp",
  "check point": "checkpoint.webp",
  "juniper": "juniper.webp",
  "cncf": "kubernetes.svg",
  "wireshark": "wireshark.webp",
};

// Favicon URLs are stable per host, so we only build the string once.
const FAVICON_URL = new Map();
// vendor@size -> a loaded <img>, or the string "failed" once we know there's none.
const IMG_CACHE = new Map();

function vendorHost(c) {
  try { return new URL(c.url).hostname; } catch { return null; }
}

// Certificates hosted on a course platform are issued by someone else (Google
// on Coursera, Harvard on edX). Their cert url points at the platform, so the
// issuer's site has to be named here for the favicon fallback.
const ISSUER_HOST = {
  "ibm": "ibm.com",
  "infosec": "infosecinstitute.com",
};

// University favicons are detailed crests that turn to mush at 26px. These
// issuers get a drawn tile instead: their usual abbreviation on their own colour.
const MONOGRAM = {
  "nyu": { text: "NYU", bg: "#57068c", fg: "#ffffff" },
  "university of colorado": { text: "CU", bg: "#000000", fg: "#cfb87c" },
  "rit": { text: "RIT", bg: "#f76902", fg: "#ffffff" },
  "umbc": { text: "UMBC", bg: "#000000", fg: "#fdb515" },
  "harvard": { text: "H", bg: "#a51c30", fg: "#ffffff" },
  "tel aviv university": { text: "TAU", bg: "#0b2e5c", fg: "#ffffff" },
  "university of wisconsin-madison": { text: "UW", bg: "#c5050c", fg: "#ffffff" },
};

function logoUrl(name, host, size) {
  const local = VENDOR_IMAGE[name.trim().toLowerCase()];
  if (local) return `images/${local}`;
  if (!host) return null;
  const cacheKey = host + "@" + size;
  let url = FAVICON_URL.get(cacheKey);
  if (!url) {
    url = `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(host)}`;
    FAVICON_URL.set(cacheKey, url);
  }
  return url;
}

// One logo tile for an organisation: its initial at first, replaced by the
// image once it loads.
function logoTile(name, host, cls, size) {
  const wrap = document.createElement("span");
  wrap.className = cls;
  wrap.textContent = (name || "?")[0].toUpperCase();

  const mono = MONOGRAM[(name || "").trim().toLowerCase()];
  if (mono) {
    wrap.textContent = mono.text;
    wrap.classList.add("logo-mono");
    wrap.dataset.len = String(mono.text.length);
    wrap.style.backgroundColor = mono.bg;
    wrap.style.color = mono.fg;
    return wrap;
  }

  const cacheKey = (name || "?").toLowerCase() + "@" + size;
  const cached = IMG_CACHE.get(cacheKey);
  if (cached === "failed") return wrap;
  if (cached) {
    // Already loaded once this session: clone the bytes the browser has cached.
    wrap.replaceChildren(cached.cloneNode());
    return wrap;
  }

  const url = logoUrl(name || "", host, size);
  if (!url) return wrap;

  // A freshly built Image() loads as soon as src is set; we deliberately do not
  // mark it loading="lazy" because the element is detached until the load fires,
  // and a lazy detached image never enters the viewport so it would never load.
  const img = new Image();
  img.decoding = "async";
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("load", () => {
    IMG_CACHE.set(cacheKey, img);
    wrap.replaceChildren(img.cloneNode());
  });
  img.addEventListener("error", () => { IMG_CACHE.set(cacheKey, "failed"); });
  img.src = url;
  return wrap;
}

// The logo for a cert. When the cert has an issuer other than its vendor, two
// tiles are shown: who issues it, then the platform it is taken on.
export function makeLogo(c, cls, size = 64) {
  const vendor = logoTile(c.vendor, vendorHost(c), cls, size);
  if (!c.issuer) return vendor;
  const issuer = logoTile(c.issuer, ISSUER_HOST[c.issuer.toLowerCase()] || null, cls, size);
  issuer.title = c.issuer;
  vendor.title = c.vendor;
  const pair = document.createElement("span");
  pair.className = "logo-pair";
  pair.append(issuer, vendor);
  return pair;
}
