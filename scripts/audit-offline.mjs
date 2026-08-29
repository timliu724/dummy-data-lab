import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidate = process.argv[2]
  ? path.resolve(projectRoot, process.argv[2])
  : path.join(projectRoot, 'outputs', 'dummy-data-generator-candidate.html');
const html = await readFile(candidate, 'utf8');
const visibleHtml = html
  .replace(/<script\b[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[\s\S]*?<\/style>/gi, '');

const checks = [
  ['single HTML document', (visibleHtml.match(/<!doctype html>/gi) ?? []).length === 1],
  ['no external script src', !/<script\b[^>]*\bsrc\s*=/i.test(html)],
  ['no external stylesheet link', !/<link\b[^>]*rel=["']stylesheet["']/i.test(html)],
  ['no external image source', !/<img\b[^>]*\bsrc\s*=/i.test(html)],
  ['no HTTP(S) URL', !/https?:\/\//i.test(html)],
  ['no fetch call', !/\bfetch\s*\(/i.test(html)],
  ['no XMLHttpRequest', !/XMLHttpRequest/i.test(html)],
  ['no WebSocket', !/\bWebSocket\b/i.test(html)],
  ['no EventSource', !/\bEventSource\b/i.test(html)],
  ['no sendBeacon', !/\bsendBeacon\b/i.test(html)],
  ['no analytics or telemetry marker', !/(google-analytics|googletagmanager|segment\.io|mixpanel|telemetry)/i.test(html)],
  ['no external source map', !/sourceMappingURL/i.test(html)],
  ['no visible Unicode replacement character', !visibleHtml.includes('\uFFFD')],
  ['no visible common mojibake marker', !/(鈥|路|攐|淩|鈫|锟)/u.test(visibleHtml)],
  ["connect-src 'none'", /connect-src 'none'/i.test(html)],
  ['blob Worker allowed', /worker-src blob:/i.test(html)],
  ['inline CSS present', /<style>[\s\S]+<\/style>/i.test(html)],
  ['inline JavaScript present', /<script>[\s\S]+<\/script>/i.test(html)],
];

const failed = checks.filter(([, passed]) => !passed).map(([name]) => name);
const result = {
  candidate,
  bytes: Buffer.byteLength(html),
  checks: Object.fromEntries(checks),
  passed: failed.length === 0,
  failed,
};
console.log(JSON.stringify(result, null, 2));
if (failed.length > 0) process.exitCode = 1;
