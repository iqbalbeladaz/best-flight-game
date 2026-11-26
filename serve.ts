// Meridian Sky Rally — serve game/ locally for play-testing.
// Serves the static game on http://localhost:8080 with no network request
// beyond the page's own files. Run: node serve.ts
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const GAME = resolve(join(here, 'game'));
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(GAME, normalize(pathname)));
  if (file !== GAME && !file.startsWith(GAME + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const size = statSync(file).size;
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'content-length': size,
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
});

server.listen(8080, '127.0.0.1', () => {
  console.log('Meridian Sky Rally at http://127.0.0.1:8080');
});
