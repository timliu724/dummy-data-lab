# Dummy Data Lab

**Transform existing CSV, TSV, or delimited TXT files into controlled dummy and test datasets—or generate linked datasets from scratch—in one offline HTML file.**

Preserve stable mappings, useful numeric distributions, and user-confirmed relationships when those structures matter to your tests.

[**Download Dummy Data Lab V1.55**](https://github.com/timliu724/dummy-data-lab/releases/download/v1.55/Dummy-Data-Lab-v1.55.html)

**No installation · No upload · Runs locally in Chrome or Edge**

## Quick start

1. Download `Dummy-Data-Lab-v1.55.html`.
2. Open the downloaded file in Chrome or Edge.
3. Load a CSV, TSV, or delimited TXT file—or paste cells copied from a spreadsheet.
4. Review the proposed column actions, generate the output, and export the result.

Use only source data you are authorised to process, and review generated output before sharing it.

## What it does

### Transform existing data

Dummy Data Lab analyses your table locally, profiles each column, recommends a transformation strategy, and lets you review or override every decision.

You can preserve useful test structure while changing sensitive or unsuitable values, choose a different output row count, preview the result, and export CSV or TSV together with a quality report.

### Generate from scratch

Create a single-table dataset or build a related-table project with:

- primary and foreign keys;
- dependent fields;
- linked dates;
- configurable table sizes;
- saved project configurations;
- ZIP export.

See the fully fictional examples in [`demo/`](demo/).

## Core capabilities

- **Stable mappings:** repeated source values can receive consistent dummy replacements within the selected scope.
- **Field-level strategies:** keep, replace, pattern-replace, shift, resample, generalise, sanitise, clear, or drop individual columns.
- **Useful numeric distributions:** numeric resampling uses bounded distribution evidence rather than only a short list of common values.
- **Evidence-based relationships:** source data can produce relationship candidates, but only user-confirmed relationships control generation and validation.
- **Business-pattern controls:** choose how strongly source ordering, grouping, mappings, null placement, numeric rank patterns, and confirmed relationships influence the result.
- **Quality reporting:** distinguish what passed, what needs review, what failed, and what was not evaluated.
- **Linked datasets:** generate and validate related tables, including configured PK/FK and linked-field rules.
- **Column profiling:** inspect inferred types, patterns, missing values, uniqueness, categories, numeric summaries, samples, and risk signals.

## Control levels

### Protection

- **Safe Test Data** is the recommended default. It protects common direct identifiers and applies risk-aware transformation recommendations while attempting to retain useful test structure.
- **ID Only** focuses mainly on direct identifiers. Indirect identifiers, rare combinations, free text, and more source structure can remain.

### Business pattern

- **Flexible** prioritises varied test rows and scenario coverage.
- **Balanced** seeks a practical compromise between fidelity, coverage, and privacy guardrails.
- **High match** retains substantially more source order, grouping, null placement, numeric rank structure, and confirmed relationships. This can improve realism but can also preserve more disclosure risk.

Detailed behaviour is documented in the [User Guide](docs/USER_GUIDE.md).

## Quality and privacy boundaries

The quality report uses four states:

- **PASS:** the evaluated contracts passed.
- **REVIEW:** output was generated, but a result or boundary needs human review.
- **FAIL:** one or more declared contracts failed; the output remains available for inspection.
- **NOT EVALUATED:** there was not enough relevant evidence or no confirmed rule for that area.

The standalone HTML is self-contained. Its Content Security Policy disables outbound connections, and the application does not include analytics or telemetry. Source rows are processed in the current browser session and are not uploaded by the application.

Dummy Data Lab provides practical masking, sanitisation, pseudonymisation, and rule-based test-data generation. It is not:

- certified anonymisation;
- a k-anonymity or differential privacy implementation;
- a statistical or machine-learning synthetic-data model;
- a guarantee that uncontrolled free text is free of sensitive information.

A PASS result applies only to the contracts that were evaluated. It is not privacy certification or a guarantee that generated data is safe for every use.

Read the [Security and Privacy notes](docs/SECURITY_PRIVACY.md) and [Known Limitations](docs/KNOWN_LIMITATIONS.md) before sharing generated output.

## Input and output

### Input

- CSV
- TSV
- delimited TXT
- cells pasted from a spreadsheet

Direct XLSX import is not supported. Save the workbook as CSV/TSV or paste the required cells.

### Output

- CSV
- optional TSV
- JSON quality reports
- saved JSON configurations
- ZIP archives for related-table projects

## Documentation

- [User Guide](docs/USER_GUIDE.md)
- [Security and Privacy](docs/SECURITY_PRIVACY.md)
- [Known Limitations](docs/KNOWN_LIMITATIONS.md)
- [Release Notes](docs/RELEASE_NOTES.md)
- [Changelog](CHANGELOG.md)
- [V1.55 Release Verification](docs/V1.55_RELEASE_VERIFICATION.md)
- [Third-party Licenses](docs/THIRD_PARTY_LICENSES.md)

## Development

Development requires Node.js 24 or later and npm.

```bash
npm install
npm run build
npm run audit:offline
```

Maintainable source is located under [`src/`](src/). Build and audit utilities are under [`scripts/`](scripts/). The standalone application itself does not require Node.js or npm.

## Support and feedback

Use [GitHub Issues](https://github.com/timliu724/dummy-data-lab/issues) to report a bug, ask a usage question, or suggest an improvement.

## License

Dummy Data Lab is released under the [MIT License](LICENSE).

Third-party components retain their own licenses. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the complete texts under [`licenses/`](licenses/).
