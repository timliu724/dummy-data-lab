import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'src');
const outputArgument = process.argv.find((argument) => argument.startsWith('--output='))?.slice('--output='.length);
const outputPath = outputArgument
  ? path.resolve(projectRoot, outputArgument)
  : path.join(projectRoot, 'outputs', 'dummy-data-generator-candidate.html');

const offlineParserPlugin = {
  name: 'disable-papa-network-input',
  setup(builder) {
    builder.onLoad({ filter: /papaparse\.browser\.min\.js$/ }, async (args) => {
      let contents = await readFile(args.path, 'utf8');
      contents = contents.replace(
        '((e,t)=>{"function"==typeof define&&define.amd?define([],t):"object"==typeof module&&"undefined"!=typeof exports?module.exports=t():e.Papa=t()})(globalThis,function r(){',
        'globalThis.Papa=(function r(){',
      );
      const closingIndex = contents.lastIndexOf('});');
      if (closingIndex >= 0) contents = `${contents.slice(0, closingIndex)}})();${contents.slice(closingIndex + 3)}`;
      contents = `class OfflineNetworkDisabled{constructor(){throw new Error("Remote input is disabled in this offline build.")}};${contents.replaceAll('XMLHttpRequest', 'OfflineNetworkDisabled')}`;
      return { contents, loader: 'js' };
    });
  },
};

async function bundle(entryPoint, options = {}) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    write: false,
    minify: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2022'],
    sourcemap: false,
    legalComments: 'none',
    charset: 'utf8',
    plugins: [offlineParserPlugin],
    ...options,
  });
  return result.outputFiles[0].text;
}

const workerSource = await bundle(path.join(sourceRoot, 'worker', 'worker-entry.js'));
const applicationSource = await bundle(path.join(sourceRoot, 'app.js'), {
  define: { __DUMMY_WORKER_SOURCE__: JSON.stringify(workerSource) },
  loader: { '.html': 'text' },
});
const css = await readFile(path.join(sourceRoot, 'styles.css'), 'utf8');
let html = await readFile(path.join(sourceRoot, 'index.html'), 'utf8');

const csp = "default-src 'none'; connect-src 'none'; img-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline' blob:; worker-src blob:; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
html = html.replace(
  /<meta http-equiv="Content-Security-Policy"[^>]*>/i,
  `<meta http-equiv="Content-Security-Policy" content="${csp}">`,
);
html = html.replace(/\s*<link rel="stylesheet" href="\.\/styles\.css">/i, () => `\n  <style>${css}</style>`);
html = html.replace(
  /\s*<script type="module" src="\.\/app\.js"><\/script>/i,
  () => `\n  <script>${applicationSource.replace(/<\/script/gi, '<\\/script')}</script>`,
);

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, html, 'utf8');

const bytes = Buffer.byteLength(html);
console.log(JSON.stringify({ outputPath, bytes, kib: Number((bytes / 1024).toFixed(2)), workerBytes: Buffer.byteLength(workerSource) }, null, 2));
