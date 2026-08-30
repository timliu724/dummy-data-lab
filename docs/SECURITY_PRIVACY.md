# Security and privacy

## Trust boundary

Dummy Data Lab V1.74 processes a user-selected file or explicitly pasted text in
the local browser. The production artifact is a standalone HTML file containing
its application code, styles, Papa Parse runtime, and Worker source.

The packaged Content Security Policy sets outbound connections to none. The
build does not load runtime code, fonts, images, styles, analytics, telemetry,
CDNs, or external APIs. Papa Parse remote-input support is disabled in the
offline bundle as an additional control.

The application does not scan unrelated local files or folders. A file is read
only after the user selects it through the browser.

## Browser memory and persistence

Source rows, bounded source samples, candidate rows, replacement mappings, and
generated results are held in memory for the active page. They are not written
to localStorage or sessionStorage.

Two source-free convenience features use browser storage:

- **sessionStorage** holds a recovery draft for the current tab. The draft can
  include interface mode, requested row count, protection and fidelity settings,
  generated-field definitions, and fictional Scratch project schemas. It does
  not contain source rows.
- **localStorage** holds optional personal field sets created in the Scratch
  field library. These are reusable schema definitions, not source datasets.

Closing the tab releases in-memory source data and mapping tables. Closing the
tab also ends the sessionStorage recovery session. Saved personal field sets can
remain until they are deleted in the application or browser site data is
cleared.

Configuration files are created only when the user downloads them. They contain
settings, schemas, policies, and relationship definitions; they do not contain
the source table rows.

## Pseudonymisation is not anonymisation

Replacing direct identifiers reduces one form of risk, but dates, rare
categories, free text, business identifiers, ordering, group sizes, and
combinations of ordinary fields can still identify a person or case.

- **Safe Test Data** is the recommended masking, sanitisation, and
  pseudonymisation workflow. It is not certified anonymisation.
- **ID Only** primarily changes direct identifiers and can leave substantial
  indirect or contextual information intact.
- **High match** intentionally retains more source structure and can therefore
  retain more disclosure risk.
- Scratch generation creates rule-based synthetic-style test data. It is not
  statistical or machine-learning synthesis.

Dummy Data Lab does not implement k-anonymity, differential privacy, formal
disclosure-risk measurement, or an anonymisation certification process.

## Data minimisation

Large inputs are profiled with bounded state. The implementation limits retained
unique values, samples, counters, and representative candidate rows rather than
keeping an unrestricted second copy of every source row.

Candidate templates are internal generation inputs. When production policies
are available, protected fields are replaced, generalised, sanitised, or reduced
to structural descriptors before retention. Public planning objects do not
contain the complete candidate cell values or original-to-generated mapping
tables.

The optional **Compare with source** view is a deliberate temporary exception to
the normal source-hiding interface. It shows at most the bounded preview rows for
one column in the active tab. Those source values are not included in downloads
and disappear when the result is invalidated or the page is closed.

## Randomness and mappings

Normal generation uses cryptographic browser randomness. A seeded source exists
for automated tests but is not selected by the production interface.

Stable mappings keep repeated source identities consistent within a selected
scope. Original keys and replacement mappings remain in memory and are not
exported. Collision checks retry to a fixed bound and report failures rather
than looping indefinitely.

## Relationship boundary

Column names can help describe evidence, but they do not automatically create a
business rule. State, postcode, city, coordinates, codes, dates, and similar
fields remain independent unless strong row-level evidence establishes one of
the supported narrow rules or the user confirms a candidate.

Strongly evidenced narrow rules and confirmed relationships can influence
generation and validation. Ambiguous candidates remain inactive, and a report
area without relevant evidence or a confirmed contract may be NOT EVALUATED.

## Text sanitisation

Text sanitisation is pattern-based. It can replace common email, phone,
identifier, and long-number shapes, but it can miss context-specific names,
events, locations, and facts. Free text always requires human review when the
source may contain sensitive narrative content.

## Rendering and error handling

Untrusted filenames, headers, samples, cells, issues, and messages are rendered
as text rather than interpreted as HTML. Errors and console messages should not
include source cell values.

The application includes no analytics or telemetry and does not send error
reports to a server.

## Export and spreadsheet safety

CSV and TSV export escape delimiters, quotes, embedded newlines, and Unicode.
CSV defaults to UTF-8 with a BOM and CRLF line endings.

Excel-safe protection checks both headers and data cells for formula-like text.
When enabled, risky text is prefixed during export. Conventional negative numeric
values remain numeric. If protection is deliberately disabled, the application
reports risky header and data-cell counts and requests confirmation before
download.

Downloads use an in-memory Blob, a short-lived object URL, and a local browser
download. Related-table projects use the same safety checks before ZIP export.
This protection reduces spreadsheet formula risk but cannot guarantee the
behaviour of every spreadsheet application or locale.

## Operational recommendations

- Work with authorised source files only.
- Keep Safe Test Data and Excel-safe export enabled unless there is a documented
  reason to change them.
- Review KEEP, High match, custom-pattern, and free-text decisions.
- Close the tab after export.
- Review generated files and screenshots before sharing.
- Treat PASS as evidence that evaluated contracts passed, not as a privacy
  certificate.
- Verify the release checksum before opening the standalone HTML.

## Third-party runtime

Papa Parse 5.5.4 is bundled locally for delimited-text parsing under the MIT
License. No CDN is used. Complete attribution is provided in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) and
[licenses/PAPA_PARSE_LICENSE.txt](../licenses/PAPA_PARSE_LICENSE.txt).
