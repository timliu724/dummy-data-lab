# V1.70 offline security audit

## Artifact

| Property | Value |
| --- | --- |
| Source commit | `9c1c61159a4ae68386d7ee9284af5ba596fbfde1` |
| Public filename | `Dummy-Data-Lab-v1.70.html` |
| Size | `984,084 bytes` |
| SHA-256 | `498C62F445B86890A7F9FF8C401A98A29E0DDD0D8F8F70A539C819BADD84D005` |

The public file is a byte-for-byte copy of the archived V1.70 candidate.

## Static checks

The packaged audit passed checks confirming one HTML document; no external script, stylesheet, image, URL, source map, network API, analytics, or telemetry marker; `connect-src 'none'`; only the required Blob Worker allowance; and bundled inline CSS and JavaScript.

The Content Security Policy blocks outbound connections and external runtime resources. Papa Parse remote-input support is disabled in the bundle as an additional control.

Source rows, profiles, mappings, and generated output remain in page memory. A source-free recovery draft can use `sessionStorage`, and optional personal field-set schemas can use `localStorage`.

This static audit verifies offline packaging and the network boundary. It is not a vulnerability assessment, privacy certification, or formal anonymisation proof.
