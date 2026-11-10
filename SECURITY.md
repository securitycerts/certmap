# Security policy

cert/map is a static site: HTML, CSS and JavaScript served from GitHub Pages, with the dataset in a single CSV file. There is no server-side code, no accounts and no user data. The selection and preferences a visitor makes stay in their own browser.

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

1. Open a private report at <https://github.com/securitycerts/certmap/security/advisories/new>.
2. Describe what you found, the URL or file involved, and the steps to reproduce it. A proof of concept helps.
3. If the problem is already being exploited, say so at the top.

You will get an acknowledgement within 7 days and an assessment within 14. Fixes for confirmed issues are released as soon as they are ready, normally within 30 days, and the report is credited to you in the advisory unless you ask otherwise.

Please do not disclose the issue publicly until a fix is live or 90 days have passed, whichever comes first.

## In scope

- Script or markup injection through the dataset, the URL (filters, shared roadmaps, deep links) or `localStorage`.
- Ways around the Content-Security-Policy of `index.html` or of the generated pages.
- A dataset entry that sends visitors to a malicious or misleading destination.
- Problems in the build and validation scripts or in the GitHub Actions workflows that could alter what is published, leak a secret or run untrusted code.
- A compromised or tampered copy of the vendored library in `assets/vendor`.

## Out of scope

- Wrong or outdated prices, links or descriptions. Those are data corrections: open an issue or a pull request, see [CONTRIBUTING.md](CONTRIBUTING.md).
- Vulnerabilities in the certification vendors' own sites.
- Findings that need a compromised browser, device or GitHub account to work.
- Missing HTTP response headers that GitHub Pages does not let a site set.
- Reports produced by an automated scanner with no demonstrated impact.

## Testing

Test against a local copy (`npm run dev`) wherever you can. Do not run automated scans or load tests against the live site, and do not try to access anyone else's data or account.

## What is already checked

Every pull request runs `scripts/security_check.py`, which rejects committed secrets, markup or dangerous URL schemes in the dataset, plain-http resources and any relaxation of the Content-Security-Policy, plus a static analysis pass over the Python scripts. Dataset text is written to the page as text, never as HTML.
