/**
 * server.js — tiny static file server for local development
 *
 * Usage:  node server.js [port]
 * Default port: 3000
 *
 * Serves the fourier-epicycles project at http://localhost:3000
 * No dependencies — uses only Node built-ins.
 */

const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const PORT  = parseInt(process.argv[2]) || 3000;
const ROOT  = __dirname;

const MIME  = {
  '.html' : 'text/html; charset=utf-8',
  '.css'  : 'text/css; charset=utf-8',
  '.js'   : 'application/javascript; charset=utf-8',
  '.json' : 'application/json',
  '.png'  : 'image/png',
  '.svg'  : 'image/svg+xml',
  '.ico'  : 'image/x-icon',
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);

  // Security: prevent path traversal outside ROOT
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(err.code === 'ENOENT' ? 404 : 500);
      return res.end(err.code === 'ENOENT' ? 'Not found' : 'Server error');
    }
    const ext  = path.extname(filePath).toLowerCase();
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type'  : mime,
      'Cache-Control' : 'no-cache',
    });
    res.end(data);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Fourier Epicycles — dev server`);
  console.log(`  ───────────────────────────────`);
  console.log(`  http://localhost:${PORT}\n`);
});
