# Contributing

Most contributions to this project are dataset changes: adding a missing certification, correcting a price, fixing a URL. You do not need to touch JavaScript or CSS to do that. Everything lives in `data/certs.csv`.

## Adding or updating a certification

1. Fork the repository and clone your fork.
2. Open `data/certs.csv` in any editor that can save UTF-8 CSV (VS Code, Sublime, Numbers, Excel — all fine). Add a new row or edit an existing one.
3. Validate the file:
   ```bash
   npm run validate
   ```
   The script exits non-zero with a line number if anything is wrong (unknown domain or level, duplicate `id`, dangling prerequisite, malformed price, invalid URL).
4. Preview locally:
   ```bash
   npm run dev
   ```
   Open `http://localhost:8000` and verify your entry appears where you expect.
5. Commit `data/certs.csv`. Open a pull request.

The dataset has a single source of truth: `data/certs.csv`. The browser parses the CSV directly at load time, so there is nothing else to regenerate. The PR check in `.github/workflows/validate.yml` runs the same validator on your branch.

## Schema

The full schema is in [`data/schema.md`](data/schema.md). In short, the 15 columns are:

```
id, name, acronym, vendor, domain, level, price_usd, currency_note,
duration_min, validity_years, prerequisites, dod_8140, url, description, tags
```

A copy-pasteable template:

```csv
my-cert-id,Full Certification Name,ACRO,Vendor,Domain Name,intermediate,500,,180,3,prereq-id,false,https://vendor.example/cert,One or two factual sentences describing what the certification covers.,tag1;tag2
```

### Closed vocabularies

`domain` must be one of:

```
Communication & Network Security
IAM
Security Architecture & Engineering
Asset Security
Security & Risk Management
Software Security
Security Operations
Cyber Threat Intelligence
Cloud/SysOps
*nix
ICS/IoT
GRC
Forensics
Incident Handling
Penetration Testing
Exploitation
```

`level` must be one of `beginner`, `intermediate`, `advanced`, `expert`.

If a certification does not fit one of these domains or levels, open an issue first rather than inventing a new value.

## Editorial style

- **Facts only.** No marketing copy. Stick to what the certification covers and how it is assessed.
- **Vendor short names** as the vendor uses them: `ISC2`, not `(ISC)²`; `OffSec`, not `Offensive Security`; `GIAC`, not `SANS/GIAC`.
- **Prices in USD.** Where a vendor lists separate member and non-member prices, or training-bundle and exam-only prices, use the exam-only USD price for `price_usd` and put the nuance in `currency_note`. Leave `price_usd` empty if the price is genuinely unknown; use `0` only if the certification is free.
- **Descriptions** are one to two sentences, around two hundred characters at most. Describe scope and assessment format; do not editorialise.
- **Prerequisites** are `id` values from this file, not acronyms. If a prerequisite does not yet exist in the file, add it in the same pull request.
- **URLs** must be the vendor's official page for the certification, not an aggregator or a third-party article.

## Reporting issues

- **Wrong price, URL or detail:** open an issue using the cert-update template, or send the pull request directly.
- **Missing certification:** if you are confident about the domain and level, send a pull request. If you are not, open an issue with a proposal first.
- **Bug in the site:** use the bug-report template. Include browser and viewport size if it is a layout issue.

## Local development for code changes

```bash
npm run dev         # serve the site on http://localhost:8000
npm run validate    # run the CSV validator
```

There is no transpilation, no bundler and no test framework. JavaScript runs as ES modules directly in the browser. CSS is hand-written. Treat the existing structure as a guide for new code: small files, no abstractions you do not need, no animations beyond the existing fades.

## Licensing

By submitting a pull request you agree that your contribution is released under the project's licences: the MIT Licence for code, CC-BY-4.0 for the dataset. There is no Contributor Licence Agreement.

## Credit

This project owes its structure to Paul Jerimy's [Security Certification Roadmap](https://pauljerimy.com/security-certification-roadmap/). It is independent of that work and not affiliated with any of the listed vendors.
