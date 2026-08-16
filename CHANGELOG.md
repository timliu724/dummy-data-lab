# Changelog

This is a user-facing summary of product evolution. It is intentionally not a
commit log, release-candidate diary, or internal audit record.

## V1.55

- Improved numeric resampling so high-cardinality values retain bounded
  distribution evidence instead of collapsing to a short top-values list.
- Added evidence-driven Balanced downsizing for representative blanks,
  categories, source spread, and useful test scenarios.
- Standardised quality outcomes as `PASS`, `REVIEW`, `FAIL`, and
  `NOT EVALUATED`, while keeping completed output available for inspection.
- Strengthened related-table generation with primary-key, foreign-key,
  dependent-field, configuration round-trip, and integrity checks.
- Required measured evidence and user confirmation before a proposed
  cross-field relationship can control generation or validation.
- Clarified synthetic domain labels, privacy boundaries, spreadsheet formula
  protection, and the limits of masking and text sanitisation.

## V1.50–V1.54

- Made repeat mappings stable within one generation while allowing fresh
  replacement values on a later generation.
- Removed fixed location vocabularies and avoided creating location
  relationships from field names alone.
- Kept validation findings advisory where output remained complete and usable,
  with clearer review messages and user-controlled export.
- Simplified the main export path around CSV while retaining TSV as an
  Advanced option.
- Reduced routine warning noise without hiding material structural or
  protected-value findings.

## V1.40–V1.49

- Added Flexible, Balanced, and High match controls for choosing how much
  source structure and business pattern fidelity to retain.
- Added live and pre-generation previews that explain how selected field rules
  affect representative values.
- Expanded pattern-aware replacement, consistency choices, and explicit
  per-field controls without silently changing the user's final action.
- Improved recommendation safeguards for identifiers, names, operational
  vocabularies, dates, codes, and uncertain fields.
- Made uniqueness and finite-value-space limitations visible as measured
  review evidence instead of unexplained generation failures.

## V1.26–V1.34

- Added bounded Australian identifier recognition using structure, checksum,
  and column context without exposing sample values in explanations.
- Introduced a transparent quality and privacy report with separate structure,
  coverage, distribution, relationship, and source-reuse evidence.
- Added source-to-output distribution comparisons for missingness, uniqueness,
  numeric ranges, medians, and bounded category drift.
- Added explainable attribute roles and finite generalisation hierarchies for
  direct identifiers, quasi-identifiers, sensitive attributes, and ordinary
  fields.
- Added aggregate quasi-identifier combination checks and clearer disclosure
  of what was measured versus not evaluated.

## Earlier V1.x foundation

- Established local CSV, TSV, TXT, and spreadsheet-paste parsing with
  quote-aware delimiter and header review.
- Added bounded profiling, type and pattern detection, and field-level
  transformation strategies.
- Added consistent replacement, pattern preservation, date/time shifting,
  resampling, generalisation, clearing, dropping, and text sanitisation.
- Separated input size from requested output size and planned small outputs
  around representative scenarios.
- Added browser-local Worker processing, CSV/TSV export safety, and a
  self-contained offline HTML build.
