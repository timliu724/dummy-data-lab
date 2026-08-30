# Changelog

This is a user-facing summary of product evolution.

## V1.74

- Made generated names, email addresses, identifiers, places, and other fictional values easier to read while remaining clearly non-production data.
- Added an Independent business-pattern mode for cases where fields should be processed without inferred cross-field structure.
- Preserved supported row-level relationships only when the source contains strong evidence, while keeping explicit relationship controls for related tables.
- Improved compact preview columns so meaningful differences remain visible without wasting horizontal space.
- Strengthened handling of ragged input rows and expanded output-quality checks for readable values and evidence-backed structure.

## V1.71

- Improved the Advanced Start layout across common desktop, laptop, and embedded widths.
- Moved Current setup below the main content when a stable sidebar no longer fits.
- Reflowed Source and Generation settings before their controls become cramped.
- Prevented Input options, primary actions, and Protection mode from compressing into unreadable layouts.
- Removed repeated mode guidance and moved the short protection boundary into a keyboard-accessible information tooltip.

## V1.70

- Reworked the guided interface as **Quick**, with less visual density and a clearer three-step path for transforming existing data or generating one table.
- Kept the full engine in **Advanced** while aligning its navigation, typography, source/output previews, relationship review, and local-running guidance with Quick.
- Added editable People, Orders, and Support Cases starting points for Quick single-table generation; related-table projects remain in Advanced.
- Added a default six-day, six-hour shift for supported time transformations and removed unnecessary Quick review blocking.
- Unified and compacted generated previews and Quality Reports, including tighter Quick column sizing, more visible rows, and **Generate another version** in Advanced.
- Improved typography, contrast, icon consistency, layout stability, and scanability across Quick and Advanced.
- Added explicit fictional sample-data onboarding in both interfaces. Samples fill the visible input first and never analyse silently.
- Made competing input sources explicit: an upload supersedes an unchanged built-in sample, while uploaded and user-authored pasted data require a deliberate source choice.
- Added a clearly labelled Advanced connected-commerce sample for the multi-table relationship workflow.

## V1.55

- First public release, with browser-local transformation, rule-based single-table and related-table generation, evidence-based recommendations, quality reporting, and offline standalone packaging.

## Earlier V1.x foundation

- Established bounded profiling, pattern-aware transformations, stable mappings, date/time shifts, distribution-aware resampling, source-size-independent output planning, relationship validation, spreadsheet-safe exports, and browser-local Worker processing.
