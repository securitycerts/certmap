# cert/map: Cybersecurity Certification Roadmap

**Live site: [certmap.dev](https://certmap.dev/)** · [All certifications as a list](https://certmap.dev/certs/) · [Dataset (CSV)](data/certs.csv)

An interactive security certification roadmap: 272 cybersecurity certifications from 62 vendors, mapped by domain and seniority, with current exam prices, prerequisites and renewal cycles. Build a certification path and share it with a link.

<img width="1696" height="310" alt="certmap" src="https://github.com/user-attachments/assets/148d2bb1-9007-4851-bb08-66f21cd8c453" />

-------

A static, open-source roadmap of cybersecurity certifications, organised by domain and seniority. Filter by vendor, level or price; open any certification for its full record; select multiple to plan a path with running cost and study-time estimates.

The site is a single-page application that runs straight from the repository with no bundler. Its only runtime library is [anime.js](https://animejs.com/), vendored in `assets/vendor` so nothing is loaded from a third party. The dataset lives in one CSV file so that non-technical contributors can submit changes without touching JavaScript.

## What it does

- A 16-domain by 4-level matrix view of every certification in the dataset.
- A list view with full names, vendors and tags, grouped by domain.
- Filters for level, domain, vendor, price range, free-only, DoD 8140, verified-price-only and the absence of prerequisites, summarised as a row of removable chips above the results.
- A data-freshness indicator and a per-cert "verified N ago" badge, driven by the date each price was last confirmed against the vendor.
- Shareable roadmaps: name your selection and copy a link (`#/roadmap/<ids>?name=<title>`). Whoever opens it sees the ordered path with cost and study-time totals, and can adopt it as their own selection without losing theirs by accident.
- A right-click menu on every certification, domain header and panel: open, select with prerequisites, copy link or Markdown, filter by the same vendor, domain or level. Shift + right-click keeps the browser's own menu.
- Keyboard control throughout: cards are focusable, `Enter` opens, `Space` selects, `J`/`K` step through certifications in the drawer, and `?` lists every shortcut.
- A collapsible filter sidebar (`F`), a hands-on-exam filter and per-domain and per-vendor counts.
- Static, crawlable pages for every certification, vendor and domain under `certs/`, generated from the same CSV, plus a sitemap.
- An About page with an FAQ (`about/`, opened from the logo), curated lists such as beginner, free, hands-on and DoD 8140 certifications, and machine-readable outputs: `llms.txt`, `llms-full.txt` and `data/certs.json`.
- A delayed hover tooltip showing price, exam length, renewal cycle, prerequisites and a brief description.
- A detail drawer per certification, deep-linkable via `#/cert/<id>`.
- A path planner that orders selected certifications by prerequisite and difficulty, with a running total of cost, study hours and approximate months at ten study-hours per week.
- A search that switches the view to a flat result list for the current query.
- Dark and light themes; the dark theme is the default and the one the design is tuned for.
- Mobile layout with a drawer-style filter panel and a single-column list.

## Project layout

```
.
├── assets/
│   ├── css/styles.css           Design tokens, layout, components.
│   ├── css/static.css           Stylesheet for the generated pages under certs/.
│   ├── og.png                   Social preview card (npm run og).
│   ├── vendor/                  anime.js ESM bundle and its licence (npm run vendor).
│   └── js/
│       ├── app.js               State, routing, filter pipeline, event wiring.
│       ├── render.js            Matrix, list, roadmap, drawer, cart and flow renderers.
│       ├── motion.js            Every animation, behind a reduced-motion guard.
│       ├── contextmenu.js       Right-click menu.
│       ├── toast.js             Confirmation messages and clipboard helper.
│       ├── format.js            Price/date formatters and the level vocabulary.
│       ├── logo.js              Vendor logos with a per-session load cache.
│       ├── dom.js               Small element builders (no innerHTML).
│       ├── data.js              CSV loader.
│       └── tooltip.js           Delayed hover tooltip.
├── data/
│   ├── certs.csv                Source of truth. The only file you edit to add or change a cert.
│   └── schema.md                Column-by-column schema documentation.
├── scripts/
│   ├── validate.mjs             Node script (no deps). Validates the CSV.
│   ├── build-pages.mjs          Node script (no deps). Writes certs/*.html and sitemap.xml.
│   ├── build-og.mjs             Dev-only. Renders assets/og.png with Playwright.
│   ├── security_check.py        Dependency-free security checks for contributions.
│   └── check-links.mjs          Dev-only Playwright link checker (run `npm i` first).
├── .github/
│   ├── workflows/
│   │   ├── pages.yml            Deploy to GitHub Pages on push to main.
│   │   ├── validate.yml         PR check for malformed dataset entries.
│   │   └── security.yml         PR security checks (data, secrets, CSP) plus bandit.
│   ├── ISSUE_TEMPLATE/          Cert-update and bug-report templates.
│   └── PULL_REQUEST_TEMPLATE.md
├── index.html
├── package.json                 Scripts and dev-only dependencies.
├── .editorconfig
├── .gitignore
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── LICENSE
└── README.md
```

## Running locally

The site is plain HTML, CSS and JavaScript. There is nothing to install to view it, but you do need a static file server because the JavaScript loads the dataset via `fetch`.

```bash
npm run dev        # python3 -m http.server 8000, then open http://localhost:8000
```

If you change `data/certs.csv`, validate it:

```bash
npm run validate   # node scripts/validate.mjs
npm run security   # python3 scripts/security_check.py (data, secret and CSP checks)
npm run build      # node scripts/build-pages.mjs (static pages under certs/ and sitemap.xml)
```

`npm run build` is what search engines see: one plain HTML page per certification, vendor and domain, an index of all of them and the sitemap. Run it after changing the CSV and commit the result; the pull-request check fails if `certs/` is stale. It also refreshes the certification count in `index.html`, regenerates `about/`, `llms-full.txt` and `data/certs.json`, and stamps a content hash on every stylesheet and module URL so a deploy never pairs new HTML with cached old assets.

The dataset has a single source of truth: `data/certs.csv`. The browser parses the CSV directly at load time; there is no generated JSON to keep in sync. Node 18 or newer is only needed for the validator; the browser side has no Node dependency.

The link checker is a dev-only tool and not part of the published site. It drives Playwright over every official URL in the dataset to catch dead links and wrong redirects:

```bash
npm install        # one-time, pulls Playwright (a devDependency)
npx playwright install chromium
npm run links      # node scripts/check-links.mjs  (append an id substring to scope it)
```

## Deploying to GitHub Pages

1. Push the repository to GitHub.
2. In the repository settings, under **Pages**, set the source to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/pages.yml` validates the data, generates the static pages, uploads the site as an artefact and publishes it.

### Getting found

- Add the site to [Google Search Console](https://search.google.com/search-console) and Bing Webmaster Tools and submit `sitemap.xml`. Until a site is verified and its sitemap submitted, a `github.io` project page can take a long time to be crawled.
- Fill in the repository's About box on GitHub: the live URL as the website, a one-line description, and topics such as `cybersecurity`, `certifications`, `security-certification-roadmap`, `infosec`, `career-roadmap`. GitHub repository pages rank on their own for these searches.
- The site is served from `certmap.dev`, set under Settings, Pages, Custom domain. The address is hardcoded in `index.html`, `robots.txt`, `llms.txt`, `404.html` and the `SITE` constant in `scripts/build-pages.mjs`; change all of them together if the domain ever moves.

There are no environment variables or secrets to configure.

## Data accuracy

The dataset is community-maintained. Most vendors do not publish their exam fees on the public certification pages; figures in `data/certs.csv` are the last known list prices in USD, sourced from official vendor pages where possible and approximate otherwise. Treat the prices as guidance and confirm with the vendor before paying.

If you find an out-of-date price, a wrong URL or a missing certification, please open a pull request against `data/certs.csv`. See `CONTRIBUTING.md`.

## Credit

The matrix structure is inspired by Paul Jerimy's [Security Certification Roadmap](https://pauljerimy.com/security-certification-roadmap/). This project is independent and not affiliated with that work or with any of the listed vendors. All trademarks are the property of their respective owners.

## Licence

The application code is released under the MIT Licence, in the `LICENSE` file (file kept under that spelling so the licence detector on GitHub picks it up). The certification dataset (`data/certs.csv` and the JSON files generated from it) is released under the Creative Commons Attribution 4.0 International Licence. If you redistribute the dataset, please credit this project.
