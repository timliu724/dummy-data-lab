# V1.55 offline security audit

## Scope

This public summary describes the static offline audit applied to the frozen
Dummy Data Lab V1.55 production artifact.

| Property | Value |
| --- | --- |
| Production tag | v1.55 |
| Production commit | 2dd498ef3e1b905c8332952c8e0ebf1abf102aba |
| Public release filename | Dummy-Data-Lab-v1.55.html |
| Size | 791,222 bytes |
| SHA-256 | 94FECCEB54F08DE523EA9EB53CF487C48229E8556C1ED4E31065078194D7FFC5 |

The public release file is a byte-for-byte copy of the verified production
artifact. It is not rebuilt during public packaging.

## Static checks

The packaged audit verifies that the artifact:

1. contains one HTML document;
2. has no external script source;
3. has no external stylesheet;
4. has no external image source;
5. contains no HTTP or HTTPS URL;
6. contains no fetch call;
7. contains no XMLHttpRequest constructor;
8. contains no WebSocket use;
9. contains no EventSource use;
10. contains no sendBeacon use;
11. contains no analytics or telemetry marker;
12. contains no external source map;
13. has no visible Unicode replacement character;
14. has no visible common mojibake marker;
15. sets connect-src to none;
16. allows only the required Blob Worker;
17. contains inline CSS; and
18. contains inline JavaScript.

The frozen V1.55 release evidence records all 18 checks passing.

## Content Security Policy

The packaged policy blocks network connections, external objects, forms,
external fonts, and external media. Application code, styles, Papa Parse, and
Worker source are bundled locally.

Papa Parse remote-input support is replaced during the build, providing an
additional control alongside the browser Content Security Policy.

## Browser storage

The offline boundary does not mean that the application makes no browser-storage
calls.

- Source rows, profile samples, candidate rows, replacement mappings, and
  generated output are not persisted.
- sessionStorage stores a source-free recovery draft for the current tab.
- localStorage stores optional personal field-set schemas.
- Downloaded configuration files contain settings and schemas, not source rows.

## Export safety

CSV, TSV, and related-table ZIP exports use local Blob downloads. Excel-safe
protection checks formula-like headers and cells and prefixes risky text when
enabled. Deliberately disabling protection produces a warning before download.

## Interpretation

This audit checks the static offline packaging and network boundary. It is not a
privacy certification, vulnerability assessment, formal anonymisation proof, or
guarantee about user-supplied data. Browser behaviour and generated output still
require ordinary release testing and human review.
