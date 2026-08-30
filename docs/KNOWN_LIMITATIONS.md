# Known limitations

Dummy Data Lab V1.74 is designed for practical browser-local test-data work. The
following boundaries are intentional and should be understood before using or
sharing generated output.

## Privacy and disclosure risk

- Safe Test Data and ID Only are masking and pseudonymisation workflows. They do
  not certify anonymisation.
- Replacing direct identifiers does not remove all risk. Rare categories,
  unusual dates, small groups, free text, business identifiers, and combinations
  of ordinary fields can remain identifying.
- Text sanitisation is pattern-based. It can replace common email, phone,
  identifier, and long-number shapes but can miss context-specific names, facts,
  events, or locations.
- High match deliberately retains more source ordering, grouping, null
  placement, rank structure, and evidence-backed or confirmed relationships.
  That fidelity can increase disclosure risk.
- Source-value and combination checks are bounded evidence, not a formal
  disclosure-risk measurement.
- A PASS quality status means evaluated contracts passed. It is not privacy
  certification or proof that the data is safe for every use.

## Detection and recommendations

- Type, semantic, delimiter, and header detection are evidence-based heuristics.
  Ambiguous input can require a manual choice.
- Column names are useful hints but do not establish a business relationship.
  Only supported narrow rules with strong row-level evidence can activate
  automatically; other candidates require user confirmation.
- Ambiguous slash dates require the user to choose an orientation before a shift
  can be applied safely.
- Unusual local date, identifier, and multi-value formats may not be recognised.
- A recommendation is decision support. The user remains responsible for final
  actions, KEEP choices, custom pattern parts, and relationship confirmation.

## Generation model

- Scratch generation is rule-based, synthetic-style test-data generation. It is
  not a statistical or machine-learning synthesis system.
- Faker is not included. Human-like fields use a bounded fictional vocabulary
  and reserved example domains rather than broad locale realism.
- Numeric resampling preserves bounded distribution evidence, not a full
  multivariate probability model.
- Stable mappings operate within the selected generation scope and are not
  exported.
- A generated value can occasionally coincide with a source value, particularly
  in small public vocabularies. The quality report separates higher-risk findings
  from ordinary bounded collisions.
- Deterministic validation failures are reported rather than silently repaired.

## Relationships

- Unconfirmed relationship candidates do not control generation.
- Strongly evidenced automatic rules and confirmed rules affect only their
  declared columns and supported relationship kind.
- A report area without relevant evidence or a confirmed contract can be NOT
  EVALUATED.
- State, postcode, city, coordinates, and similar fields remain independent
  unless strong row-level evidence establishes a supported rule or the user
  confirms an evidence-backed relationship.
- Related-table integrity checks cover configured primary keys, foreign keys,
  cardinality rules, and linked fields. They cannot validate undeclared business
  rules.

## Input and scale

- Direct XLSX import is not supported. Save as CSV/TSV or paste cells copied
  from a spreadsheet.
- Pasted text occupies browser memory as one large string. File selection is
  preferable for large inputs.
- Inputs above 100 MB receive a strong advisory warning, but the practical limit
  depends on the browser, device memory, column count, value length, and selected
  output size.
- Profiling and planning use bounded counters, samples, and candidate reservoirs.
  Rare source patterns can be missed when they fall outside those bounds.
- The output-row warning above 5,000 rows is advisory rather than a hard maximum.
- High match requires the output row count to equal the source data-row count.

## Coverage and preview

- Coverage is based on bounded structural scenarios, not every possible
  combination of source values.
- Increasing the output row count cannot recover a scenario that has no retained
  representative template.
- The preview shows at most 100 rows even when the download contains more.
- Compare with source exposes only a bounded in-tab view and should not be used
  in public screenshots when the source is sensitive.

## Browser and storage

- The production artifact targets current Chrome and Edge.
- Source rows, profile samples, mappings, and generated output remain in page
  memory until the tab is closed or work is cleared.
- sessionStorage is used for a source-free recovery draft of settings and
  fictional Scratch schemas.
- localStorage is used for optional saved personal field sets.
- Clearing browser site data removes saved field sets; closing the tab clears
  the active source-data session.
- Browser-local processing prevents the application from uploading data, but it
  cannot prevent a user from later sharing an unsafe source, screenshot, or
  export.

## Export

- CSV and TSV formula protection reduces spreadsheet formula risk but cannot
  guarantee behaviour in every spreadsheet application or locale.
- Turning formula protection off requires an explicit warning confirmation.
- Related-table ZIP export contains generated tables, configuration, a manifest,
  and documentation. Review the whole archive before sharing it.
- Configuration files contain settings and schemas, not source rows, but their
  field names and business rules can still reveal design information.

Use the quality report, review free text and high-fidelity choices, and treat the
generated output as data that still requires a human release decision.
