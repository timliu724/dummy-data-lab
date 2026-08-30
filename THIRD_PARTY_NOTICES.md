# Third-party notices

Dummy Data Lab includes or uses the components listed below. The project license
does not replace their respective licenses.

## Papa Parse 5.5.4

- **Component:** Papa Parse
- **Version:** 5.5.4
- **Project/source:** https://github.com/mholt/PapaParse
- **License:** MIT
- **Use:** Runtime dependency. A local browser build is bundled into the
  standalone Dummy Data Lab HTML. No CDN is used, and remote-input support is
  disabled in the offline build.
- **Attribution requirement:** The Papa Parse copyright and MIT permission
  notice must be included with copies or substantial portions of the software.
- **Complete license text:** [`licenses/PAPA_PARSE_LICENSE.txt`](licenses/PAPA_PARSE_LICENSE.txt)

Copyright (c) 2015 Matthew Holt.

## esbuild 0.28.1

- **Component:** esbuild, including its platform package selected by npm
- **Version:** 0.28.1
- **Project/source:** https://github.com/evanw/esbuild
- **License:** MIT
- **Use:** Build-time dependency only. esbuild is not loaded by the standalone
  HTML at runtime.
- **Attribution requirement:** The esbuild copyright and MIT permission notice
  applies to redistributed copies or substantial portions of esbuild.
- **Complete license text:** [`licenses/ESBUILD_LICENSE.txt`](licenses/ESBUILD_LICENSE.txt)

Copyright (c) 2020 Evan Wallace.

## Evaluated but not distributed

`@faker-js/faker` was evaluated during development but is not listed in
`package.json` or `package-lock.json`, and no Faker code is included in the
V1.71 production artifact.
