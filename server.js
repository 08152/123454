import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Render web-server: serves the game files only. It is deliberately NOT a game/matchmaking server.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 10000);
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.glb': 'model/gltf-binary'
};

http.createServer(async (req, res) => {
  try {
    const rawPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
    const requested = rawPath === '/' ? '/index.html' : rawPath;
    const safePath = path.normalize(requested).replace(/^([/\\]|\.\.(?:[/\\]|$))+/, '');
    const fullPath = path.join(__dirname, safePath);
    if (!fullPath.startsWith(__dirname + path.sep) && fullPath !== path.join(__dirname, 'index.html')) {
      res.writeHead(403); res.end('Forbidden'); return;
    }
    const data = await readFile(fullPath);
    res.writeHead(200, {
      'Content-Type': mime[path.extname(fullPath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Datei nicht gefunden. Bitte index.html und alle Projektdateien im Hauptverzeichnis lassen.');
  }
}).listen(port, '0.0.0.0', () => {
  console.log(`Island Drop läuft auf Port ${port}`);
});
