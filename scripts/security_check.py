#!/usr/bin/env python3
"""Security gate for contributions.

Runs on every pull request (see .github/workflows/security.yml). It is dependency
free so it works on a bare Python install, and it focuses on the things that can
actually go wrong in a static, data-driven site like this one:

  * a committed secret (private key, cloud or service token)
  * a dataset row that could carry markup or a dangerous URL scheme into the page
  * a plain-http resource that would trip mixed-content or downgrade a visitor
  * a spreadsheet-formula injection hiding in a CSV cell
  * a relaxed Content-Security-Policy or a target=_blank link missing rel=noopener

Exit status is non-zero if any high-severity finding is reported, so CI fails the
pull request. Warnings are printed but do not fail the build.
"""
from __future__ import annotations

import csv
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Directories and file types that are either third-party, generated, or binary and
# therefore not contributor-authored source we need to scan.
SKIP_DIRS = {".git", "node_modules", "favicon", "images", "dist", "coverage", ".cache"}
SKIP_FILES = {"package-lock.json"}
SKIP_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".icns",
    ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip", ".lock",
}

# High-signal secret patterns. Kept deliberately narrow so the check stays quiet
# on ordinary code and only fires on things that are unmistakably credentials.
SECRET_PATTERNS = [
    ("private key block", re.compile(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----")),
    ("AWS access key id", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[0-9A-Za-z-]{10,}\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}\b")),
    ("generic private key in env", re.compile(r"(?i)(api[_-]?key|secret|passwd|password|token)\s*[:=]\s*['\"][^'\"]{16,}['\"]")),
]

# Text columns of the dataset that end up rendered on the page.
CSV_TEXT_COLUMNS = ["name", "acronym", "vendor", "description", "currency_note", "tags", "restricted_to"]
# A leading one of these in a CSV cell is how spreadsheet formula injection starts.
FORMULA_PREFIXES = ("=", "+", "@", "\t")


class Finding:
    __slots__ = ("severity", "where", "message")

    def __init__(self, severity: str, where: str, message: str):
        self.severity = severity
        self.where = where
        self.message = message


def iter_source_files():
    for path in sorted(ROOT.rglob("*")):
        if not path.is_file():
            continue
        rel_parts = path.relative_to(ROOT).parts
        if any(part in SKIP_DIRS for part in rel_parts):
            continue
        if path.name in SKIP_FILES or path.suffix.lower() in SKIP_SUFFIXES:
            continue
        yield path


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def scan_secrets(findings: list[Finding]) -> None:
    for path in iter_source_files():
        # Skip the scanner's own pattern table so it does not flag itself.
        if path.resolve() == Path(__file__).resolve():
            continue
        for lineno, line in enumerate(read_text(path).splitlines(), 1):
            for label, pattern in SECRET_PATTERNS:
                if pattern.search(line):
                    findings.append(Finding("high", f"{rel(path)}:{lineno}", f"possible {label} committed"))


def check_dataset(findings: list[Finding]) -> None:
    csv_path = ROOT / "data" / "certs.csv"
    if not csv_path.exists():
        return
    with csv_path.open(newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for lineno, row in enumerate(reader, 2):
            cid = (row.get("id") or "").strip()

            url = (row.get("url") or "").strip()
            if url:
                scheme = url.split(":", 1)[0].lower() if ":" in url else ""
                if scheme == "http":
                    findings.append(Finding("high", f"certs.csv:{lineno} [{cid}]", "url uses http; use https"))
                elif scheme not in ("https",):
                    findings.append(Finding("high", f"certs.csv:{lineno} [{cid}]", f"url uses unexpected scheme '{scheme}:'"))

            for col in CSV_TEXT_COLUMNS:
                value = row.get(col) or ""
                if "<" in value or ">" in value:
                    findings.append(Finding("high", f"certs.csv:{lineno} [{cid}]", f"{col} contains angle brackets (possible markup)"))
                if re.search(r"(?i)javascript:|data:text/html", value):
                    findings.append(Finding("high", f"certs.csv:{lineno} [{cid}]", f"{col} contains a dangerous URL scheme"))
                if value[:1] in FORMULA_PREFIXES:
                    findings.append(Finding("warn", f"certs.csv:{lineno} [{cid}]", f"{col} starts with '{value[:1]}' (CSV formula injection risk)"))


def check_html(findings: list[Finding]) -> None:
    for path in iter_source_files():
        if path.suffix.lower() not in (".html", ".htm"):
            continue
        text = read_text(path)

        for match in re.finditer(r"https?://[^\s\"'<>]+|http://", text):
            if match.group(0).startswith("http://"):
                findings.append(Finding("high", rel(path), "plain-http resource reference (mixed content)"))
                break

        # Any new-tab link must defend against reverse tabnabbing.
        for anchor in re.finditer(r"<a\b[^>]*target=[\"']_blank[\"'][^>]*>", text, re.IGNORECASE):
            if "noopener" not in anchor.group(0).lower():
                findings.append(Finding("warn", rel(path), "target=_blank link without rel=noopener"))

        if path.name == "index.html":
            if "Content-Security-Policy" not in text:
                findings.append(Finding("high", rel(path), "missing Content-Security-Policy meta tag"))
            csp = next((m.group(0) for m in re.finditer(r"Content-Security-Policy[^>]*", text)), "")
            if re.search(r"script-src[^;]*'unsafe-(inline|eval)'", csp):
                findings.append(Finding("high", rel(path), "CSP script-src allows unsafe-inline/unsafe-eval"))


def main() -> int:
    findings: list[Finding] = []
    scan_secrets(findings)
    check_dataset(findings)
    check_html(findings)

    highs = [f for f in findings if f.severity == "high"]
    warns = [f for f in findings if f.severity == "warn"]

    for f in highs:
        print(f"FAIL  {f.where}: {f.message}")
    for f in warns:
        print(f"warn  {f.where}: {f.message}")

    if highs:
        print(f"\n{len(highs)} security issue(s) must be fixed before merge.")
        return 1
    print(f"Security check passed ({len(warns)} warning(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
