# Dummy Data Lab V1.70 release notes

V1.70 makes Dummy Data Lab easier to enter without reducing the depth of its local data engine. The product now presents two clear interfaces: **Quick** for transforming existing data and generating one table, and **Advanced** for detailed controls and related-table projects.

## Highlights

- Quick uses a quieter, guided three-step flow with improved spacing, typography, tables, previews, and primary actions.
- Advanced retains its multi-table, key, relationship, fidelity, configuration, and export capabilities while adopting the same visual language and a more scannable review layout.
- Quick single-table generation starts from editable People, Orders, or Support Cases templates, supports custom columns, and allows default fields to be removed.
- Supported temporal transformations start with a practical six-day, six-hour shift rather than blocking first-time generation on an empty setting.
- Output previews and Quality Reports are more compact and consistent. Advanced can generate another version without rebuilding the configuration.
- Both interfaces provide an explicit **Try sample data** action. The fictional 16-row, 12-column sample is placed visibly into the source area and is analysed only after the user chooses **Analyse locally**.
- Source choice is explicit. A newly uploaded file supersedes an unchanged built-in sample; an uploaded file plus user-authored pasted data requires a deliberate choice without deleting either source.
- Advanced includes a labelled connected-commerce sample for its validated People, Products, Orders, and Appointments relationship workflow.

## Validation summary

- Complete automated suite: 480/480 passed.
- Focused UI and interaction coverage: 89/89 passed within the complete suite.
- Fictional sample engine flow: 16 rows, 12 columns, four transformation families, 59 scenarios, and a valid 40-row result with zero validation issues.
- Standalone build: passed.
- Static offline audit: passed all checks.

See [V1.70 Release Verification](V1.70_RELEASE_VERIFICATION.md) for the recorded scope and the browser-acceptance status of this prepared public export.

## Artifact

- Filename: `Dummy-Data-Lab-v1.70.html`
- Planned tag: `v1.70`
- Source commit: `9c1c61159a4ae68386d7ee9284af5ba596fbfde1`
- Size: `984,084 bytes`
- SHA-256: `498C62F445B86890A7F9FF8C401A98A29E0DDD0D8F8F70A539C819BADD84D005`
