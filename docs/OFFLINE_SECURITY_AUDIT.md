# V1.81 offline security audit

## Artifact

| Property | Value |
| --- | --- |
| Public filename | `Dummy-Data-Lab-v1.81.html` |
| Size | `1,030,403 bytes` |
| SHA-256 | `393727aaf0a2f4be66c747bd78c5f0626bfb02312c6613de9ea36f81e7e53f6a` |

All 18 packaging checks passed on the standalone HTML identified above.

## Static checks

The packaged audit passed checks confirming one HTML document; no external script, stylesheet, image, URL, source map, network API, analytics, or telemetry marker; `connect-src 'none'`; only the required Blob Worker allowance; and bundled inline CSS and JavaScript.

The Content Security Policy blocks outbound connections and external runtime resources. Papa Parse remote-input support is disabled in the bundle as an additional control.

Source rows, profiles, mappings, and generated output remain in page memory. A source-free recovery draft can use `sessionStorage`, and optional personal field-set schemas can use `localStorage`.

This static audit verifies offline packaging and the network boundary. It is not a vulnerability assessment, privacy certification, or formal anonymisation proof.
