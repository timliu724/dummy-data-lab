# Dummy Data Lab V1.70 user guide

## Before you begin

Download **Dummy-Data-Lab-v1.70.html** from the GitHub Release and verify its
SHA-256 checksum before use. Open the file locally in a current Chrome or Edge
browser. The application is self-contained and does not require a server,
account, or runtime installation.

Use only data you are authorised to process. Dummy Data Lab can mask,
pseudonymise, sanitise, and generate test data, but it does not certify
anonymisation.

## Choose a workflow

The first choice is between transforming an existing table and generating data
from scratch.

### Transform a table

Use this workflow when you already have CSV, TSV, TXT, or cells copied from a
spreadsheet.

1. Select a file, paste cells from Excel, or choose **Try sample data**.
2. Leave delimiter and header detection on Auto unless the preview is wrong.
3. Select **Analyse locally**.
4. Review the detected columns and recommended actions.
5. Choose the output row count and business-pattern level.
6. Confirm any relationships you want the generator to preserve.
7. Generate, inspect the preview and quality report, then export.

Direct XLSX import is not supported. Save the workbook as CSV/TSV or copy and
paste the required cells.

### Generate from scratch

Use Scratch when no source table is required.

- **One table** creates one CSV from a template or custom fields.
- **Related tables** creates a project with primary keys, foreign keys,
  dependent fields, and linked dates. Projects can be saved as a JSON
  configuration and exported as a ZIP.

Scratch values are deliberately test-oriented. They are not produced by a
statistical or ML synthetic-data model.

The built-in fictional sample is placed visibly into the input area. It is not
analysed until you choose **Analyse locally**. A new upload supersedes an
unchanged built-in sample. If an upload and user-authored paste are both
present, choose which source to analyse; neither source is silently deleted.

## Quick and Advanced views

Quick presents the main decisions in a guided sequence:

1. add a source or choose a Scratch template;
2. review settings and generate;
3. validate and download.

Quick also generates one table from editable People, Orders, or Support Cases
starters. Advanced exposes additional controls such as exact repeated-value
behaviour, custom pattern parts, relationship groups, saved field sets,
detailed project keys, optional TSV export, and the connected-commerce
multi-table sample. Switching views does not discard the current configuration.

## Output size

Source and output size are independent. A large input can produce a 50, 200,
1,000, or custom-row test dataset.

Presets are available for 50, 100, 200, 500, and 1,000 rows. Requests above
5,000 rows receive an advisory performance warning. High match is the exception:
it requires the output row count to equal the source data-row count because it
preserves the complete source row sequence.

Coverage messages describe whether bounded source scenarios have representative
output rows. Increasing the requested row count cannot recover a scenario for
which no safe representative template was retained.

## Protection modes

### Safe Test Data

The default mode. It recommends risk-aware actions for direct identifiers,
quasi-identifiers, free text, categories, numbers, and dates while attempting to
keep useful test structure.

This is best-effort masking, sanitisation, and pseudonymisation. It is not
certified anonymisation.

### ID Only

Primarily replaces direct identifiers. Indirect identifiers, rare values,
unusual dates, free text, and combinations of otherwise ordinary fields can
remain. Review the output carefully.

## Business-pattern levels

- **Flexible** prioritises varied rows and coverage. Source order and consecutive
  grouping may change.
- **Balanced** is the default compromise between fidelity, coverage, and privacy
  guardrails. It can preserve common shapes, stable mappings, bounded source
  blocks, and user-confirmed relationships.
- **High match** retains the complete source row sequence and more structural
  evidence, including group boundaries, null positions, numeric rank patterns,
  and confirmed relationships where configured.

High match can be useful for system testing, but preserving more structure can
also preserve more disclosure risk. It remains pseudonymisation, not formal
statistical synthesis or anonymisation.

## Column actions

Each source column receives a recommended action and a separate final action.

- **KEEP:** retain reviewed low-risk values.
- **REPLACE:** generate replacement values, optionally using a stable mapping.
- **PATTERN_REPLACE:** keep an observed structural shape while replacing value
  content.
- **SHIFT:** move dates, times, or numeric sequences by an explicit offset.
- **RESAMPLE:** generate from bounded source distribution evidence or an allowed
  value set.
- **GENERALISE:** reduce detail or precision.
- **TEXT_SANITISE:** replace recognisable embedded email, phone, and identifier
  patterns.
- **CLEAR:** keep the column but empty its output values.
- **DROP:** remove the column.

Recommended actions never silently overwrite a later user choice. Keeping a
high-risk field or a source-derived pattern can trigger a review warning.

### Stable and independent replacement

For REPLACE and PATTERN_REPLACE:

- **Smart** keeps genuine repeated source identities stable while allowing new
  identities when additional rows reuse a template.
- **Always consistent** maps the same source identity to the same result in the
  selected scope.
- **Independent** generates each occurrence separately.

### Dates and shifts

Dates are detected from values as well as headers. Supported forms include ISO,
day-first, month-first, month-name, and common date-time representations.

An ambiguous slash date requires the user to choose a date orientation.
Supported temporal SHIFT actions start with a six-day, six-hour offset that can
be changed before generation. For related date or number columns,
create and enable a Shift Group so that the same offset and ordering contract
can be applied together. Invalid source ordering is reported rather than
silently repaired.

## Relationship handling

Relationship candidates can be proposed from row-level evidence, such as a
stable code-to-description mapping or compatible ordered dates. A candidate does
nothing until the user confirms it.

Column names alone never activate business logic. For example, city, state, and
postcode fields remain independent unless the data contains suitable evidence
and the user deliberately confirms a rule.

Confirmed relationships can guide generation and be validated in the output.
Unconfirmed relationships may be shown as pending evidence or reported as NOT
EVALUATED.

Use a Consistent Mapping Group when the same entity appears in more than one
identifier column. Use a Shift Group for related dates or sequences.

## Reading the quality report

The report separates structure, coverage, distributions and relationships, and
privacy/leakage evidence.

- **PASS:** all evaluated contracts in that area passed.
- **REVIEW:** output exists, but evidence or a boundary needs inspection.
- **FAIL:** one or more declared contracts failed.
- **NOT EVALUATED:** no relevant source evidence or confirmed rule was available.

FAIL does not delete the completed result or automatically prevent download.
This allows the user to inspect and diagnose the output. PASS is not privacy
certification, proof of anonymisation, or a guarantee of business suitability.

The optional **Compare with source** view shows only a bounded preview in the
current tab. Source values displayed there are not added to exports.

## Export

CSV is the default export and uses UTF-8 with a BOM and CRLF line endings for
spreadsheet compatibility. Advanced mode can also export TSV. Related-table
projects export a ZIP containing table files, configuration, manifest, and a
short README. The quality report can be downloaded as JSON.

Excel-safe protection is enabled by default. Formula-like text in headers or
data cells is prefixed during export so spreadsheet software treats it as text.
If protection is disabled, the application reports risky header and cell counts
and asks for confirmation before downloading. Ordinary negative numbers remain
numeric.

## Configuration and browser storage

Configuration export/import saves settings, schemas, relationships, and project
definitions. It does not embed source rows.

For recovery in the current tab, Dummy Data Lab uses sessionStorage for a
source-free draft containing general settings and fictional Scratch schemas.
Source rows are not stored in that draft. Optional personal field sets use
localStorage so they can be reused in later sessions.

Close the tab to release source rows, profiles, and mapping tables held in
memory. Clear browser site data if you also want to remove saved personal field
sets.

## Large files and troubleshooting

- Prefer file selection rather than paste for large inputs; pasted text already
  occupies browser memory as one string.
- Inputs above 100 MB receive a strong advisory warning.
- If delimiter detection is wrong, open Input options and choose comma, tab,
  semicolon, pipe, or a custom character.
- If the first row is misclassified, set Header row to Yes or No and analyse
  again.
- If a date is ambiguous, choose the intended orientation in the column action
  settings.
- If generation reports a relationship failure, inspect the confirmed rule and
  source evidence instead of assuming the output was repaired.
- Keep Excel-safe protection enabled unless you understand the spreadsheet
  formula risk.

## Privacy checklist

Before sharing generated data:

1. inspect free-text columns;
2. review unusual dates, rare categories, and small groups;
3. check any KEEP and High match choices;
4. confirm the quality report status and limitations;
5. verify that screenshots and exports contain no source comparison values;
6. remember that pseudonymised data can still be identifying.
