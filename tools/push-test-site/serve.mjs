// Tiny static server for the Web Push test site: node tools/push-test-site/serve.mjs  → http://localhost:5500
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root) || !/\.(html|js)$/.test(file) || file.endsWith('serve.mjs')) { res.writeHead(404).end(); return; }
  try {
    res.writeHead(200, { 'Content-Type': types[file.slice(file.lastIndexOf('.'))], 'Cache-Control': 'no-store' });
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
}).listen(5500, () => console.log('push test site on http://localhost:5500'));
