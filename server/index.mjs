import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { normalizeIsbn, validIsbn } from './isbn.mjs';
import { lookup } from './catalog.mjs';
import { demoItems } from './demo.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const error = (status, message) => Object.assign(new Error(message), { status });

function validate(input, previous = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw error(400, 'Dados inválidos.');
  const merged = { ...previous, ...input };
  const result = {};
  for (const [key, limit] of Object.entries({ title: 250, author: 250, isbn: 32, language: 12, description: 5000, category: 100, coverUrl: 1000, color: 20, objectKind: 30 })) {
    if (merged[key] != null && typeof merged[key] !== 'string') throw error(400, `Campo inválido: ${key}.`);
    result[key] = (merged[key] || '').trim();
    if (result[key].length > limit) throw error(400, `Campo demasiado longo: ${key}.`);
  }
  if (!result.title) throw error(400, 'O título ou nome é obrigatório.');
  if (!['book', 'object'].includes(merged.type)) throw error(400, 'Tipo inválido.');
  result.type = merged.type;
  result.shelf = merged.shelf ?? 0;
  if (!Number.isInteger(result.shelf) || result.shelf < 0 || result.shelf > 3) throw error(400, 'Escolhe uma prateleira entre 0 e 3.');
  result.isbn = normalizeIsbn(result.isbn);
  if (result.isbn && !validIsbn(result.isbn)) throw error(400, 'ISBN inválido. Confirma o dígito de controlo.');
  if (result.language && !/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(result.language)) throw error(400, 'Código de língua inválido.');
  if (result.color && !/^#[\da-fA-F]{6}$/.test(result.color)) throw error(400, 'Cor inválida.');
  result.color ||= '#6d7c64';
  if (result.objectKind && !['plant', 'plush', 'trophy', 'souvenir', 'magic', 'bookend'].includes(result.objectKind)) throw error(400, 'Tipo de adereço inválido.');
  if (result.type === 'object') result.objectKind ||= 'souvenir';
  return result;
}

async function readJson(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) throw error(415, 'Utiliza conteúdo JSON.');
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024) throw error(413, 'Pedido demasiado grande.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw error(400, 'JSON inválido.'); }
}

export function createApp({ dataDir = process.env.DATA_DIR || join(ROOT, 'data'), distDir = join(ROOT, 'dist'), fetchImpl = fetch } = {}) {
  dataDir = resolve(dataDir);
  const mediaDir = join(dataDir, 'media');
  mkdirSync(mediaDir, { recursive: true });
  const db = new DatabaseSync(join(dataDir, 'bookshelf.sqlite'));
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, payload TEXT NOT NULL);');
  const list = () => db.prepare('SELECT payload FROM items ORDER BY rowid').all().map(row => JSON.parse(row.payload));
  const get = id => { const row = db.prepare('SELECT payload FROM items WHERE id = ?').get(id); return row ? JSON.parse(row.payload) : null; };
  const insert = item => db.prepare('INSERT INTO items (id, payload) VALUES (?, ?)').run(item.id, JSON.stringify(item));

  async function cacheCover(url) {
    if (!url) return { coverUrl: '' };
    if (/^\/media\/[a-zA-Z0-9_-]+\.(jpg|png|webp|svg)$/.test(url)) {
      if (!existsSync(join(dataDir, url))) throw error(400, 'Capa local não encontrada.');
      return { coverUrl: url };
    }
    if (!/^https:\/\/covers\.openlibrary\.org\/b\/(id|isbn|olid)\/[A-Za-z0-9]+-[SML]\.jpg$/.test(url)) throw error(400, 'Só são aceites capas do catálogo Open Library ou capas locais.');
    const filename = `${createHash('sha256').update(url).digest('hex')}.jpg`;
    if (existsSync(join(mediaDir, filename))) return { coverUrl: `/media/${filename}` };
    try {
      const response = await fetchImpl(`${url}?default=false`, { signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Invalid cover response');
      if (Number(response.headers.get('content-length')) > 5 * 1024 * 1024) throw new Error('Cover too large');
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; if (size > 5 * 1024 * 1024) throw new Error('Cover too large'); chunks.push(chunk); }
      const bytes = Buffer.concat(chunks);
      if (bytes.length < 3 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) throw new Error('Cover is not JPEG');
      writeFileSync(join(mediaDir, filename), bytes);
      return { coverUrl: `/media/${filename}` };
    } catch {
      return { coverUrl: '', coverWarning: 'Não foi possível guardar a capa. Os dados do livro foram guardados; podes voltar a procurar a edição mais tarde.' };
    }
  }

  const server = createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'same-origin');
    const send = (status, body) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(body === undefined ? undefined : JSON.stringify(body)); };
    try {
      const url = new URL(request.url, 'http://localhost');
      const { pathname } = url;
      const method = request.method;
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && request.headers.origin) {
        let originHost;
        try { originHost = new URL(request.headers.origin).host; } catch { throw error(403, 'Origem inválida.'); }
        const host = new URL(`http://${request.headers.host}`).host;
        if (originHost !== host) throw error(403, 'Pedido de outra origem bloqueado.');
      }
      if (pathname === '/api/health' && method === 'GET') return send(200, { status: 'ok', storage: 'sqlite' });
      if (pathname === '/api/items' && method === 'GET') return send(200, { items: list() });
      if (pathname === '/api/items' && method === 'POST') {
        const item = validate(await readJson(request));
        const cover = await cacheCover(item.coverUrl);
        Object.assign(item, { coverUrl: cover.coverUrl, id: randomUUID(), createdAt: new Date().toISOString() });
        insert(item);
        return send(201, { ...item, ...(cover.coverWarning ? { coverWarning: cover.coverWarning } : {}) });
      }
      const match = pathname.match(/^\/api\/items\/([a-zA-Z0-9-]+)$/);
      if (match && ['PUT', 'DELETE'].includes(method)) {
        const previous = get(match[1]);
        if (!previous) throw error(404, 'Item não encontrado.');
        if (method === 'DELETE') { db.prepare('DELETE FROM items WHERE id = ?').run(match[1]); return send(204); }
        const item = validate(await readJson(request), previous);
        const cover = await cacheCover(item.coverUrl);
        Object.assign(item, { coverUrl: cover.coverUrl, id: previous.id, createdAt: previous.createdAt });
        db.prepare('UPDATE items SET payload = ? WHERE id = ?').run(JSON.stringify(item), item.id);
        return send(200, { ...item, ...(cover.coverWarning ? { coverWarning: cover.coverWarning } : {}) });
      }
      if (pathname === '/api/demo' && method === 'POST') {
        const entries = demoItems(mediaDir);
        db.exec('BEGIN');
        try { for (const item of entries) if (!get(item.id)) insert({ ...item, createdAt: new Date().toISOString() }); db.exec('COMMIT'); }
        catch (cause) { db.exec('ROLLBACK'); throw cause; }
        return send(200, { items: list() });
      }
      if (pathname === '/api/lookup' && method === 'GET') return send(200, await lookup({ isbn: url.searchParams.get('isbn') || '', q: url.searchParams.get('q') || '' }, fetchImpl));
      if (pathname.startsWith('/api/')) throw error(404, 'Endpoint não encontrado.');
      if (!['GET', 'HEAD'].includes(method)) throw error(405, 'Método não permitido.');
      let filename;
      if (pathname.startsWith('/media/')) {
        if (!/^\/media\/[a-zA-Z0-9_-]+\.(jpg|png|webp|svg)$/.test(pathname)) throw error(404, 'Ficheiro não encontrado.');
        filename = join(dataDir, pathname);
      } else {
        const decoded = decodeURIComponent(pathname);
        filename = resolve(distDir, `.${decoded}`);
        if (!filename.startsWith(`${resolve(distDir)}/`) && filename !== resolve(distDir)) throw error(404, 'Ficheiro não encontrado.');
        if (!existsSync(filename) || statSync(filename).isDirectory()) {
          if (extname(pathname)) throw error(404, 'Ficheiro não encontrado.');
          filename = join(distDir, 'index.html');
        }
      }
      if (!existsSync(filename)) throw error(404, 'Interface não compilada. Executa npm run build e volta a iniciar.');
      response.writeHead(200, { 'Content-Type': MIME[extname(filename)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/media/') ? 'public, max-age=86400' : 'no-cache' });
      response.end(method === 'HEAD' ? undefined : readFileSync(filename));
    } catch (cause) {
      if (!cause.status) console.error('Request failed:', cause.message);
      if (!response.headersSent) send(cause.status || 500, { error: cause.status ? cause.message : 'Erro interno. Tenta novamente.' });
      else response.end();
    }
  });
  server.on('close', () => db.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createApp();
  const port = Number(process.env.PORT || 3001);
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`BookShelf API listening on ${host}:${port}`));
  const stop = () => server.close(() => process.exit(0));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
