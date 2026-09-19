# Dummy Data Lab V1.78

This release includes the fixes validated in the V1.76–V1.78 development candidates.

- Keep the current file, pasted data and selected source when switching between Quick and Advanced. Changing input invalidates previous analysis and downloads.
- Preserve renamed fields, generator types, ranges, omitted columns and row counts when returning to Quick or adding another field.
- Restore the latest fictional schema and general settings after a refresh. Starting another task clears the previous draft; source rows are never stored in the recovery draft.
- Keep generated results available when returning to review without changing settings.
- Show blocking parse errors and recoverable input warnings clearly, and reset parsing options for a new task.
- Improve replacement of ordinary prose containing numbers, without changing explicit pattern replacement or supported identifier formats.
- Show the actual output row count and all non-routine warning groups, including results that need structural review.

Quick remains a single-table workflow; related tables remain in Advanced. Independent, Balanced and High match retain their existing boundaries. Automatic relationships do not override explicit field actions, and field names alone do not establish business relationships. Applicable repeated-value mappings stay consistent within a generation; later generations may vary.

Existing screenshots and demo GIFs are unchanged. Earlier releases and downloads remain available on the Releases page.
