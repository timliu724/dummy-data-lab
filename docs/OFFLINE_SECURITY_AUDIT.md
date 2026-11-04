# V1.79 offline security audit

## Artifact

| Property | Value |
| --- | --- |
| Public filename | `Dummy-Data-Lab-v1.79.html` |
| Size | `1,031,134 bytes` |
| SHA-256 | `80e3fff53b13688f65dca7b5f5696b1dc98d58660c818fd5884997c22b9aae76` |

The root application and release asset are byte-for-byte copies of the verified V1.79 build.

## Static checks

The packaged audit passed checks confirming one HTML document; no external script, stylesheet, image, URL, source map, network API, analytics, or telemetry marker; `connect-src 'none'`; only the required Blob Worker allowance; and bundled inline CSS and JavaScript.

The Content Security Policy blocks outbound connections and external runtime resources. Papa Parse remote-input support is disabled in the bundle as an additional control.

Source rows, profiles, mappings, and generated output remain in page memory. A source-free recovery draft can use `sessionStorage`, and optional personal field-set schemas can use `localStorage`.

This static audit verifies offline packaging and the network boundary. It is not a vulnerability assessment, privacy certification, or formal anonymisation proof.
