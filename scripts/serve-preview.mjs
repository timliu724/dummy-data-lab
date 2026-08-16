import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const portArgument = process.argv.find((argument) => argument.startsWith('--port='))?.slice('--port='.length);
const port = portArgument === undefined ? 4173 : Number(portArgument);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new RangeError('Preview port must be an integer from 0 to 65535.');

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.tsv': 'text/tab-separated-values; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
});

function safeProjectPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const candidate = path.resolve(projectRoot, `.${decoded}`);
  const prefix = `${projectRoot}${path.sep}`;
  if (candidate !== projectRoot && !candidate.startsWith(prefix)) return null;
  return candidate;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${host}`);
    let target = safeProjectPath(url.pathname);
    if (!target) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }
    const details = await stat(target);
    if (details.isDirectory()) target = path.join(target, 'index.html');
    const content = await readFile(target);
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': MIME_TYPES[path.extname(target).toLocaleLowerCase()] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(content);
  } catch (error) {
    response.writeHead(error?.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(error?.code === 'ENOENT' ? 'Not found' : 'Preview server error');
  }
});

server.listen(port, host, () => {
  const address = server.address();
  console.log(`Preview server: http://${host}:${address.port}/`);
  console.log('Local-only, no uploads, no cache. Press Ctrl+C to stop.');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
