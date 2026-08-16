import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidatePath = process.argv[2]
  ? path.resolve(projectRoot, process.argv[2])
  : path.join(projectRoot, 'outputs', 'dummy-data-generator-candidate.html');
const candidate = await readFile(candidatePath);
const basicImportStarted = performance.now();
const [{ BasicProvider }, { SeededRandomSource }] = await Promise.all([
  import('../src/generation/basic-provider.js'),
  import('../src/generation/random-source.js'),
]);
const basicImportMs = performance.now() - basicImportStarted;
const basic = new BasicProvider({ random: new SeededRandomSource(7007) });
const basicStarted = performance.now();
for (let index = 0; index < 1000; index += 1) {
  basic.replacement({ detectedType: 'NAME_LIKE' });
  basic.replacement({ detectedType: 'EMAIL' });
  basic.replacement({ detectedType: 'PHONE_LIKE', sourceValue: '0400 000 000' });
  basic.replacement({ detectedType: 'ADDRESS_LIKE' });
}
const basicGenerationMs = performance.now() - basicStarted;

let faker = { available: false };
try {
  const fakerImportStarted = performance.now();
  const fakerModule = await import('@faker-js/faker');
  const fakerImportMs = performance.now() - fakerImportStarted;
  const slimBundle = await build({
    stdin: {
      contents: "import {Faker,en} from '@faker-js/faker';const f=new Faker({locale:[en]});globalThis.fakerCandidate=()=>[f.person.fullName(),f.internet.email(),f.phone.number(),f.location.streetAddress()];",
      resolveDir: projectRoot,
      sourcefile: 'faker-candidate.js',
    },
    bundle: true,
    write: false,
    minify: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2022'],
    sourcemap: false,
    legalComments: 'none',
  });
  const fakerInstance = new fakerModule.Faker({ locale: [fakerModule.en] });
  fakerInstance.seed(7007);
  const fakerStarted = performance.now();
  for (let index = 0; index < 1000; index += 1) {
    fakerInstance.person.fullName();
    fakerInstance.internet.email();
    fakerInstance.phone.number();
    fakerInstance.location.streetAddress();
  }
  const fakerGenerationMs = performance.now() - fakerStarted;
  const fakerBytes = slimBundle.outputFiles[0].contents.byteLength;
  faker = {
    available: true,
    version: '10.5.0',
    importMs: fakerImportMs,
    generationMsFor4000Values: fakerGenerationMs,
    slimBundleBytes: fakerBytes,
    slimBundleGzipBytes: gzipSync(slimBundle.outputFiles[0].contents).byteLength,
    candidateIncreasePercent: Number((fakerBytes / candidate.byteLength * 100).toFixed(2)),
  };
} catch (error) {
  faker = { available: false, error: error.message };
}

console.log(JSON.stringify({
  candidate: {
    path: candidatePath,
    bytes: candidate.byteLength,
    gzipBytes: gzipSync(candidate).byteLength,
  },
  basicProvider: {
    importMs: basicImportMs,
    generationMsFor4000Values: basicGenerationMs,
    safetyCharacteristic: 'Uses obvious test labels and reserved example.invalid email domains.',
  },
  faker,
}, null, 2));
