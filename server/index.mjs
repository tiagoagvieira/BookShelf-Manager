import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { normalizeIsbn, validIsbn } from './isbn.mjs';
import { lookup } from './catalog.mjs';
import { demoItems } from './demo.mjs';
import { organize, originalCabinet } from './positions.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
const error = (status, message) => Object.assign(new Error(message), { status });
const rewardUnlocks = { keepsake: 1, plush: 5, photoFrame: 20, travelBox: 50 };

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
  result.cabinet = merged.cabinet;
  if (result.cabinet !== undefined && (!Number.isInteger(result.cabinet) || result.cabinet < 0 || result.cabinet > 4)) throw error(400, 'Armário inválido.');
  for (const [key, minimum, maximum] of [
    ['layoutX', 0, 100], ['layoutY', 0, 100], ['rotation', -180, 180],
    ['bookWidth', 10, 80], ['bookHeight', 80, 400],
  ]) {
    if (merged[key] !== undefined && (!Number.isFinite(merged[key]) || merged[key] < minimum || merged[key] > maximum)) {
      throw error(400, `Valor inválido: ${key}.`);
    }
    result[key] = merged[key];
  }
  result.layoutX ??= 0;
  result.layoutY ??= 0;
  result.rotation ??= 0;
  if (result.type === 'book') {
    result.bookWidth ??= 25;
    result.bookHeight ??= 220;
  }
  if (result.type === 'book') {
    result.readingStatus = merged.readingStatus ?? 'unread';
    if (!['unread', 'reading', 'finished'].includes(result.readingStatus)) throw error(400, 'Estado de leitura inválido.');
    result.completions = merged.completions ?? [];
    if (!Array.isArray(result.completions) || result.completions.length > 500 || result.completions.some(date => {
      return typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date;
    })) throw error(400, 'Datas de conclusão inválidas.');
  }
  result.isbn = normalizeIsbn(result.isbn);
  if (result.isbn && !validIsbn(result.isbn)) throw error(400, 'ISBN inválido. Confirma o dígito de controlo.');
  if (result.language && !/^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(result.language)) throw error(400, 'Código de língua inválido.');
  if (result.color && !/^#[\da-fA-F]{6}$/.test(result.color)) throw error(400, 'Cor inválida.');
  result.color ||= '#6d7c64';
  if (result.objectKind && !['plant', 'plush', 'trophy', 'souvenir', 'magic', 'bookend', 'travelBox', 'photoFrame', 'heartBox', 'elf', 'keepsake', 'flowerBouquet', 'miniature'].includes(result.objectKind)) throw error(400, 'Tipo de adereço inválido.');
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
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, profile TEXT NOT NULL DEFAULT \'Pessoal\', payload TEXT NOT NULL);');
  if (!db.prepare('PRAGMA table_info(items)').all().some(column => column.name === 'profile')) db.exec("ALTER TABLE items ADD COLUMN profile TEXT NOT NULL DEFAULT 'Pessoal'");
  db.exec('CREATE INDEX IF NOT EXISTS items_profile_idx ON items(profile); CREATE TABLE IF NOT EXISTS profiles (name TEXT PRIMARY KEY COLLATE NOCASE, settings TEXT NOT NULL DEFAULT \'{}\'); INSERT OR IGNORE INTO profiles(name) VALUES (\'Pessoal\');');
  const rows = (profile = 'Pessoal') => db.prepare('SELECT payload FROM items WHERE profile = ? ORDER BY rowid').all(profile).map(row => JSON.parse(row.payload));
  const list = (profile = 'Pessoal') => rows(profile).sort((a, b) => a.cabinet - b.cabinet || a.shelf - b.shelf || a.order - b.order);
  const get = (id, profile = 'Pessoal') => { const row = db.prepare('SELECT payload FROM items WHERE id = ? AND profile = ?').get(id, profile); return row ? JSON.parse(row.payload) : null; };
  const insert = (item, profile = 'Pessoal') => db.prepare('INSERT INTO items (id, profile, payload) VALUES (?, ?, ?)').run(item.id, profile, JSON.stringify(item));
  const update = (item, profile = 'Pessoal') => db.prepare('UPDATE items SET payload = ? WHERE id = ? AND profile = ?').run(JSON.stringify(item), item.id, profile);
  function transaction(action) {
    db.exec('BEGIN IMMEDIATE');
    try { action(); db.exec('COMMIT'); }
    catch (cause) { db.exec('ROLLBACK'); throw cause; }
  }
  function appendPosition(item, items) {
    item.cabinet ??= originalCabinet(item);
    item.order = items.reduce((next, entry) => entry.cabinet === item.cabinet && entry.shelf === item.shelf
      ? Math.max(next, entry.order + 1) : next, 0);
    item.layoutX ??= Math.min(92, item.order * 7);
    item.layoutY ??= 0;
    item.rotation ??= 0;
    if (item.type === 'book') {
      item.bookWidth ??= 25;
      item.bookHeight ??= 220;
    }
  }
  function assertRewardUnlocked(item, profile) {
    const requiredBooks = rewardUnlocks[item.objectKind];
    const bookCount = list(profile).filter(entry => entry.type === 'book').length;
    if (!requiredBooks || bookCount < requiredBooks) throw error(403, 'Este adereço continua bloqueado. Desbloqueia-o através de uma conquista da coleção.');
  }
  transaction(() => {
    const items = rows('Pessoal');
    for (const item of items) {
      if (!Number.isInteger(item.order)) appendPosition(item, items.filter(entry => Number.isInteger(entry.order)));
      else {
        item.layoutX ??= Math.min(92, item.order * 7);
        item.layoutY ??= 0;
        item.rotation ??= 0;
        if (item.type === 'book') {
          item.bookWidth ??= 25;
          item.bookHeight ??= 220;
        }
      }
      update(item);
    }
  });

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
      const profileFromRequest = () => {
        let name;
        try { name = decodeURIComponent(request.headers['x-profile'] || 'Pessoal').trim(); }
        catch { throw error(400, 'Perfil inválido.'); }
        if (!name || name.length > 40 || /[\\/\u0000-\u001f]/.test(name)) throw error(400, 'Perfil inválido.');
        if (!db.prepare('SELECT 1 FROM profiles WHERE name = ?').get(name)) throw error(404, 'Perfil não encontrado.');
        return name;
      };
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && request.headers.origin) {
        let originHost;
        try { originHost = new URL(request.headers.origin).host; } catch { throw error(403, 'Origem inválida.'); }
        const host = new URL(`http://${request.headers.host}`).host;
        if (originHost !== host) throw error(403, 'Pedido de outra origem bloqueado.');
      }
      if (pathname === '/api/health' && method === 'GET') return send(200, { status: 'ok', storage: 'sqlite' }); 
      if (pathname === '/api/profiles' && method === 'GET') {
        const profiles = db.prepare('SELECT name, settings FROM profiles ORDER BY CASE WHEN name = \'Pessoal\' THEN 0 ELSE 1 END, name COLLATE NOCASE').all().map(row => ({ name: row.name, settings: JSON.parse(row.settings) }));
        return send(200, { profiles });
      }
      if (pathname === '/api/profiles' && method === 'POST') {
        const input = await readJson(request);
        const name = typeof input?.name === 'string' ? input.name.trim() : '';
        if (!name || name.length > 40 || /[\\/\u0000-\u001f]/.test(name)) throw error(400, 'Indica um nome de perfil válido (até 40 caracteres).');
        const settings = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings) ? input.settings : {};
        try { db.prepare('INSERT INTO profiles(name, settings) VALUES (?, ?)').run(name, JSON.stringify(settings)); }
        catch (cause) { if (cause.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || cause.code === 'SQLITE_CONSTRAINT_UNIQUE') throw error(409, 'Já existe um perfil com esse nome.'); throw cause; }
        return send(201, { name, settings });
      }
      const profileRoute = pathname.match(/^\/api\/profiles\/([^/]+)$/);
      if (profileRoute && method === 'PUT') {
        let name;
        try { name = decodeURIComponent(profileRoute[1]); } catch { throw error(400, 'Perfil inválido.'); }
        const input = await readJson(request);
        if (!input?.settings || typeof input.settings !== 'object' || Array.isArray(input.settings)) throw error(400, 'Configurações inválidas.');
        const result = db.prepare('UPDATE profiles SET settings = ? WHERE name = ?').run(JSON.stringify(input.settings), name);
        if (!result.changes) throw error(404, 'Perfil não encontrado.');
        return send(200, { name, settings: input.settings });
      }
      const importRoute = pathname.match(/^\/api\/profiles\/([^/]+)\/import$/);
      if (importRoute && method === 'POST') {
        let name;
        try { name = decodeURIComponent(importRoute[1]); } catch { throw error(400, 'Perfil inválido.'); }
        if (!db.prepare('SELECT 1 FROM profiles WHERE name = ?').get(name)) throw error(404, 'Perfil não encontrado.');
        const { item: source } = await readJson(request);
        if (!source || typeof source.id !== 'string' || !/^[a-zA-Z0-9-]{1,150}$/.test(source.id)) throw error(400, 'Identificador de peça inválido.');
        const existing = get(source.id, name);
        if (existing) return send(200, { imported: false, item: existing });
        const item = validate(source);
        const cover = await cacheCover(item.coverUrl);
        Object.assign(item, { id: source.id, createdAt: typeof source.createdAt === 'string' ? source.createdAt : new Date().toISOString(), order: Number.isInteger(source.order) && source.order >= 0 ? source.order : 0, coverUrl: cover.coverUrl });
        transaction(() => insert(item, name));
        return send(200, { imported: true, item });
      }
      const profile = profileFromRequest();
      if (pathname === '/api/items' && method === 'GET') return send(200, { items: list(profile) });
      if (pathname === '/api/layout' && method === 'POST') {
        const { mode, id, cabinet, shelf, before, layoutX, layoutY, rotation } = (await readJson(request)) ?? {};
        transaction(() => {
          const items = list(profile);
          if (['author', 'title', 'random'].includes(mode)) {
            organize(items, mode);
            items.forEach(item => update(item, profile));
            return;
          }
          const item = items.find(entry => entry.id === id);
          if (!item) throw error(404, 'Item não encontrado.');
          if (mode === 'place') {
            if (![0, 1, 2, 3, 4].includes(cabinet) || ![0, 1, 2, 3].includes(shelf) ||
              ![layoutX, layoutY, rotation].every(Number.isFinite) || layoutX < 0 || layoutX > 100 || layoutY < 0 || layoutY > 100 || rotation < -180 || rotation > 180) {
              throw error(400, 'Posição livre inválida.');
            }
            Object.assign(item, { cabinet, shelf, layoutX, layoutY, rotation });
            update(item, profile);
            return;
          }
          if (mode !== 'move' || ![0, 1, 2, 3, 4].includes(cabinet) || ![0, 1, 2, 3].includes(shelf)) throw error(400, 'Posição inválida.');
          if (before === id) return;
          const group = items.filter(entry => entry.id !== id && entry.cabinet === cabinet && entry.shelf === shelf);
          const index = before == null ? group.length : group.findIndex(entry => entry.id === before);
          if (index < 0) throw error(409, 'A posição mudou. Atualize a estante e tente novamente.');
          Object.assign(item, { cabinet, shelf });
          group.splice(index, 0, item);
          group.forEach((entry, order) => update({ ...entry, order }, profile));
        });
        return send(200, { items: list(profile) });
      }
      if (pathname === '/api/items' && method === 'POST') {
        const item = validate(await readJson(request));
        if (item.type === 'object') assertRewardUnlocked(item, profile);
        const cover = await cacheCover(item.coverUrl);
        Object.assign(item, { coverUrl: cover.coverUrl, id: randomUUID(), createdAt: new Date().toISOString() });
        transaction(() => { appendPosition(item, list(profile)); insert(item, profile); });
        return send(201, { ...item, ...(cover.coverWarning ? { coverWarning: cover.coverWarning } : {}) });
      }
      const match = pathname.match(/^\/api\/items\/([a-zA-Z0-9-]+)$/);
      if (match && ['PUT', 'DELETE'].includes(method)) {
        const previous = get(match[1], profile);
        if (!previous) throw error(404, 'Item não encontrado.');
        if (method === 'DELETE') { db.prepare('DELETE FROM items WHERE id = ? AND profile = ?').run(match[1], profile); return send(204); }
        const changes = await readJson(request);
        const item = validate(changes, previous);
        if (item.type === 'object' && (previous.type !== 'object' || item.objectKind !== previous.objectKind)) assertRewardUnlocked(item, profile);
        const cover = await cacheCover(item.coverUrl);
        transaction(() => {
          const current = get(previous.id, profile);
          if (!current) throw error(404, 'Item não encontrado.');
          Object.assign(item, validate(changes, current), { id: current.id, createdAt: current.createdAt });
          if (Object.hasOwn(changes, 'coverUrl') || item.coverUrl === previous.coverUrl) item.coverUrl = cover.coverUrl;
          item.order = current.order;
          if (item.cabinet !== current.cabinet || item.shelf !== current.shelf) appendPosition(item, list(profile));
          update(item, profile);
        });
        return send(200, { ...item, ...(cover.coverWarning ? { coverWarning: cover.coverWarning } : {}) });
      }
      if (pathname === '/api/demo' && method === 'POST') {
        const entries = demoItems(mediaDir);
        transaction(() => {
          const items = list(profile);
          for (const item of entries) {
            if (get(item.id, profile)) continue;
            appendPosition(item, items);
            item.createdAt = new Date().toISOString();
            insert(item, profile);
            items.push(item);
          }
        });
        return send(200, { items: list(profile) });
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
        if (!filename.startsWith(`${resolve(distDir)}${sep}`) && filename !== resolve(distDir)) throw error(404, 'Ficheiro não encontrado.');
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
