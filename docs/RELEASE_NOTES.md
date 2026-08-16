# Dummy Data Lab V1.55 release notes

V1.55 is the first public release of Dummy Data Lab: an offline, single-file
browser tool for transforming delimited data into controlled test datasets or
generating new single-table and related-table test data from scratch.

## Highlights

- Open one standalone HTML file in a current Chrome or Edge browser. No server,
  account, upload, external API, or runtime installation is required.
- Analyse CSV, TSV, TXT, or spreadsheet-pasted data locally and review a
  recommended action for each column before generating output.
- Use stable replacement mappings, pattern-aware replacement, fixed shifts,
  resampling, generalisation, clearing, dropping, and best-effort text
  sanitisation.
- Choose Flexible, Balanced, or High match business-pattern handling. Balanced
  is the default compromise between useful fidelity, test coverage, and privacy
  guardrails; High match retains more source structure and therefore more
  disclosure risk.
- Preserve numeric distribution evidence during numeric resampling and report
  whether checked distribution contracts passed.
- Review relationship candidates based on row-level evidence. Relationships
  become generation and validation contracts only after user confirmation;
  column names alone never activate a relationship.
- Generate one table or linked People, Products, Orders, and Appointments-style
  projects with primary keys, foreign keys, dependent fields, configuration
  save/load, and ZIP export.
- Inspect a quality and privacy report with explicit PASS, REVIEW, FAIL, and
  NOT EVALUATED states.

## Quality status meaning

- **PASS:** the contracts that were evaluated passed.
- **REVIEW:** usable output was produced, but evidence or a boundary needs human
  review.
- **FAIL:** at least one declared contract failed. The completed result remains
  downloadable so the user can inspect it.
- **NOT EVALUATED:** a report area did not have enough relevant source evidence
  or a confirmed rule to evaluate.

A PASS is not a privacy certification, an anonymisation guarantee, or proof
that the output is suitable for every business purpose.

## Offline and export behaviour

The production artifact is self-contained and uses a restrictive Content
Security Policy with outbound connections disabled. Source rows, profile
samples, and mapping tables remain in the active browser session and are not
persisted. A source-free recovery draft may use `sessionStorage`, and optional
personal field sets use `localStorage`.

CSV export defaults to UTF-8 with a BOM and CRLF line endings. Advanced mode can
also export TSV. Related-table projects export as ZIP. Excel-safe protection is
enabled by default and prefixes risky formula-like text during export; users
receive an explicit warning before deliberately exporting unprotected cells.

## Known limitations

- Safe Test Data and ID Only are masking and pseudonymisation workflows, not
  certified anonymisation.
- Text sanitisation is pattern-based and can miss context-specific names,
  facts, or identifiers.
- Scratch output is synthetic-style test data, not statistical or ML-based
  synthetic modelling.
- High match can retain row order, group sizes, rare structure, and confirmed
  relationships. That fidelity can increase disclosure risk.
- Direct XLSX import is not supported. Copy cells from Excel or use CSV/TSV.
- Business relationships are never guaranteed unless the user confirms them.

## Production artifact

- **Release filename:** `Dummy-Data-Lab-v1.55.html`
- **Production tag:** `v1.55`
- **Production commit:** `2dd498ef3e1b905c8332952c8e0ebf1abf102aba`
- **Size:** `791,222 bytes`
- **SHA-256:** `94FECCEB54F08DE523EA9EB53CF487C48229E8556C1ED4E31065078194D7FFC5`

The public filename is a byte-for-byte copy of the independently verified V1.55
production artifact. Public packaging commits do not change the production tag
or product behaviour.
