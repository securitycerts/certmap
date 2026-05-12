# `certs.csv` schema

One row per certification. All columns are required (use an empty value when unknown — do not omit the column).

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | slug | yes | Lowercase, hyphenated. Primary key. Example: `oscp`, `aws-saa`. |
| `name` | string | yes | Full official name. |
| `acronym` | string | yes | Short label shown on the card. |
| `vendor` | string | yes | Issuing organization. Use the vendor's official short name (`ISC2`, `GIAC`, `OffSec`, `CompTIA`, …). |
| `domain` | enum | yes | One of the 16 domains (see below). |
| `level` | enum | yes | `beginner` \| `intermediate` \| `advanced` \| `expert`. |
| `price_usd` | number | yes | Exam fee in USD. Leave empty if unknown. `0` means free. |
| `currency_note` | string | no | Free-form clarification (e.g. `Members $760 non-members`). |
| `duration_min` | number | no | Exam length in minutes. Empty if N/A. |
| `validity_years` | number | no | Renewal cycle in years. `0` or empty = lifetime / none. |
| `prerequisites` | list | no | Semicolon-separated cert `id`s. Each must exist in the file. |
| `dod_8140` | bool | yes | `true` or `false`. |
| `url` | URL | yes | Official certification page. Must start with `http(s)://`. |
| `description` | string | yes | One or two sentences. Factual; no marketing copy. |
| `tags` | list | no | Semicolon-separated free-form tags (`red-team;web;hands-on`). |

## Allowed `domain` values

```
Communication & Network Security
IAM
Security Architecture & Engineering
Asset Security
Security & Risk Management
Security Assessment & Testing
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

## Allowed `level` values

- `beginner` — foundational, no significant prerequisites.
- `intermediate` — assumes 1–3 years experience.
- `advanced` — assumes deep specialization, 3–5 years.
- `expert` — capstone certifications, hands-on labs or executive-level credentials.

## CSV quoting rules

Standard RFC 4180. Wrap any field containing a comma, newline, or double quote in `"..."` and escape inner quotes by doubling them (`""`).
