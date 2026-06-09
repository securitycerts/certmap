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

function vendorLogoUrl(c, size) {
  const key = (c.vendor || "").trim().toLowerCase();
  const local = VENDOR_IMAGE[key];
  if (local) return `images/${local}`;
  const host = vendorHost(c);
  if (!host) return null;
  const cacheKey = host + "@" + size;
  let url = FAVICON_URL.get(cacheKey);
  if (!url) {
    url = `https://www.google.com/s2/favicons?sz=${size}&domain=${encodeURIComponent(host)}`;
    FAVICON_URL.set(cacheKey, url);
  }
  return url;
}

export function makeLogo(c, cls, size = 64) {
  const wrap = document.createElement("span");
  wrap.className = cls;
  wrap.textContent = (c.vendor || "?")[0].toUpperCase();

  const cacheKey = (c.vendor || "?").toLowerCase() + "@" + size;
  const cached = IMG_CACHE.get(cacheKey);
  if (cached === "failed") return wrap;
  if (cached) {
    // Already loaded once this session: clone the bytes the browser has cached.
    wrap.replaceChildren(cached.cloneNode());
    return wrap;
  }

  const url = vendorLogoUrl(c, size);
  if (!url) return wrap;

  const img = new Image();
  img.decoding = "async";
  img.loading = "lazy";
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
