# Dummy Data Lab

**Offline, single-file browser tool for transforming CSV/TXT data into controlled
dummy and test datasets, with field-level strategies, relationship controls, and
quality reports.**

Transform existing data—or generate linked test datasets—entirely in your
browser, with field-by-field control and no upload.

Current release: **V1.55**. The user-facing application is one standalone HTML
file. It needs no Python environment, package installation, account, server, CDN,
or external API at runtime.

## What it does

Dummy Data Lab supports two workflows.

### Transform existing data

Load a CSV, TSV, or delimited TXT file, or paste cells copied from a spreadsheet.
The application analyses the table locally, profiles each column, recommends a
transformation strategy, and lets you review or override every decision. It then
generates the requested number of rows, validates the result, and exports CSV or
TSV.

Input size and output size are independent. A large source can be profiled while
the output remains a small test fixture.

### Generate from scratch

Create a new single-table dataset from built-in field generators and custom
settings, or build a related-table project with primary keys, foreign keys,
dependent fields, and linked dates. Related-table projects can be saved as a
configuration and exported as a ZIP.

Scratch generation produces obvious, rule-based test data. It is not a
statistical or machine-learning synthetic-data model.

## Why Dummy Data Lab

The useful part is the combination of local processing, explicit control, and
visible evidence:

- **Browser-local:** selected files and pasted values are processed in the
  current browser session.
- **Single HTML file:** download it, open it, and start. No runtime installation
  is required.
- **Column profiling:** review inferred types, patterns, missing values,
  uniqueness, categories, numeric summaries, samples, and risk signals.
- **Field-level strategies:** keep, replace, pattern-replace, shift, resample,
  generalise, sanitise, clear, or drop each column.
- **Stable mappings:** repeated source identities can receive consistent dummy
  replacements within a selected scope.
- **Numeric distributions:** numeric resampling uses bounded distribution
  evidence instead of relying only on a short top-values list.
- **Business-pattern controls:** choose how much source order, grouping, mapping,
  null placement, and confirmed relationships should influence the result.
- **Relationship confirmation:** row-level evidence can suggest a relationship,
  but only the user can activate it as a generation and validation contract.
- **Quality reporting:** see what passed, what needs review, what failed, and
  what could not be evaluated.
- **Linked datasets:** generate and validate related tables, then export them
  together.

## Quick start

1. Download **Dummy-Data-Lab-v1.55.html** from GitHub Releases.
2. Open the file locally in a current Chrome or Edge browser.
3. Select a CSV/TXT/TSV file or paste cells copied from Excel, then choose
   **Analyse locally**.
4. Review the recommended column actions, output row count, and business-pattern
   level.
5. Generate, inspect the preview and quality report, then download the result.

Use only source data you are authorised to process, and review the generated
output before sharing it.

## Protection modes

### Safe Test Data

The recommended default. It protects common direct identifiers, applies
risk-aware recommendations, and attempts to retain useful test shapes and
coverage. It is a best-effort masking, sanitisation, and pseudonymisation
workflow—not certified anonymisation.

### ID Only

Primarily replaces direct identifiers. Indirect identifiers, rare combinations,
free text, and business structure can remain. Treat it as pseudonymisation and
review the output carefully.

## Business-pattern modes

- **Flexible** prioritises varied test rows and coverage. Source order and
  consecutive grouping may change.
- **Balanced** is the default. It seeks a practical compromise between useful
  fidelity, coverage, and privacy guardrails. Stable mappings, common formats,
  bounded source blocks, and confirmed relationships can be preserved where
  appropriate.
- **High match** retains substantially more source structure and requires the
  output row count to match the source row count. It can preserve row order,
  group boundaries, null placement, numeric rank patterns, and confirmed
  relationships. This may improve realism, but it can also preserve more
  disclosure risk.

None of these modes performs formal statistical synthetic modelling.

## Relationship handling

Dummy Data Lab does not invent a business relationship solely because columns
are named state, postcode, city, or something similar. Fields remain independent
unless there is stronger evidence and the user confirms a rule.

Row-level evidence can create a relationship candidate. A candidate is not
active by default. Once confirmed, the relationship can guide generation and be
checked as an output contract. When no relationship is confirmed or relevant
evidence is unavailable, that part of the quality report may be
**NOT EVALUATED**.

## Quality and privacy report

The report uses four explicit states:

- **PASS:** the contracts that were evaluated passed.
- **REVIEW:** output was generated, but evidence or a boundary needs human
  review.
- **FAIL:** one or more declared contracts failed. The completed output remains
  downloadable for inspection.
- **NOT EVALUATED:** the report did not have relevant source evidence or a
  confirmed rule for that area.

PASS does not mean privacy certification, guaranteed business suitability, or
formal proof of anonymisation.

## Offline and security model

The V1.55 production artifact is self-contained. Application code, styles,
parser code, and Worker source are included in the HTML. Its Content Security
Policy disables outbound connections, and the build does not use external
scripts, fonts, images, analytics, or telemetry.

Source rows, profile samples, candidate rows, and replacement mappings are not
written to persistent browser storage. A source-free recovery draft of general
settings and fictional schemas can use **sessionStorage** for the current tab.
Optional personal field sets use **localStorage** so they can be reused later.
Clearing browser site data removes those saved settings.

CSV and TSV exports include optional Excel-safe formula protection. When enabled,
risky text beginning with characters such as equals, plus, minus, or at-sign is
prefixed during export. If protection is disabled, the application warns before
exporting risky headers or cells.

## Privacy boundaries

Dummy Data Lab can:

- mask and replace source values;
- pseudonymise direct identifiers;
- apply best-effort text sanitisation;
- preserve confirmed test-relevant structure;
- generate synthetic-style data from scratch.

It is not:

- certified anonymisation;
- a k-anonymity engine;
- a differential privacy implementation;
- an SDV replacement or ML/statistical synthesiser;
- a substitute for human review of uncontrolled free text.

High-fidelity structure, rare groups, unusual dates, or combinations of ordinary
fields can remain identifying even when direct identifiers have changed.

## Supported input and output

**Input**

- CSV
- TSV
- delimited TXT, including comma, tab, semicolon, pipe, and a custom
  single-character delimiter
- cells pasted from a spreadsheet

Direct XLSX import is not supported. Save as CSV/TSV or paste the cells.

**Output**

- CSV with UTF-8 BOM and CRLF defaults
- optional TSV in Advanced mode
- ZIP for related-table projects
- JSON configuration save/load
- JSON quality report

## Release download and verification

The first public release uses **Dummy-Data-Lab-v1.55.html**.

- Size: **791,222 bytes**
- SHA-256:
  **94FECCEB54F08DE523EA9EB53CF487C48229E8556C1ED4E31065078194D7FFC5**
- Production tag: **v1.55**
- Production commit:
  **2dd498ef3e1b905c8332952c8e0ebf1abf102aba**

Verify the downloaded file before use. See
[release verification](docs/V1.55_RELEASE_VERIFICATION.md).

## Known limitations

- Text sanitisation is pattern-based and can miss contextual names, facts, and
  identifiers.
- Ambiguous dates and uncertain detections can require manual review.
- High match deliberately retains more source structure.
- Very large files remain limited by the memory and performance of the browser
  and device.
- Browser-local processing prevents upload by the application, but it does not
  make an unsafe source or generated file safe to share.
- Relationships that have not been confirmed receive weaker guarantees.

See the [user guide](docs/USER_GUIDE.md),
[security and privacy notes](docs/SECURITY_PRIVACY.md), and
[public release notes](docs/RELEASE_NOTES.md).

## Development

Development requires Node.js 24 or later and npm.

    npm install
    npm run build
    npm run audit:offline

The V1.55 public export does not include the private development test suite.
The standalone application does not require tests or Node.js at runtime.

The default build output is written under **outputs/**, which is intentionally
excluded from Git. The maintainable source remains under **src/**; the GitHub
Release asset is the verified standalone HTML.

## License

Dummy Data Lab is released under the [MIT License](LICENSE).

Third-party components retain their own licenses. See
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the complete texts in
[licenses](licenses/).
