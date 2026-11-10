import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/index.mjs';
import { validIsbn, normalizeIsbn } from '../server/isbn.mjs';
import { lookup } from '../server/catalog.mjs';

async function fixture(t, options = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'bookshelf-test-'));
  const server = createApp({ dataDir, ...options });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = 'GET', body, headers = {}) => {
    const response = await fetch(`${base}${path}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { response, body: response.status === 204 ? null : await response.json() };
  };
  t.after(async () => { if (server.listening) await new Promise(resolve => server.close(resolve)); rmSync(dataDir, { recursive: true, force: true }); });
  return { dataDir, server, base, request };
}

const book = { type: 'book', title: 'O Hobbit', author: 'J. R. R. Tolkien', isbn: '978-0-261-10221-7', language: 'pt', shelf: 0, color: '#567456' };

test('ISBN validates checksums, accepts hyphens and ISBN-10 X, rejects non-book EAN', () => {
  assert.equal(normalizeIsbn(' 978-0-261-10221-7 '), '9780261102217');
  for (const value of ['9780261102217', '0261102214', '080442957X']) assert.equal(validIsbn(value), true, value);
  for (const value of ['9780261102218', '0261102215', '5601234567892', 'abcd', '']) assert.equal(validIsbn(value), false, value);
});

test('health, CRUD, partial update, delete and missing item', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/health')).body.status, 'ok');
  assert.deepEqual((await request('/api/items')).body.items, []);
  const created = await request('/api/items', 'POST', book);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.isbn, '9780261102217');
  assert.ok(created.body.id);
  const update = await request(`/api/items/${created.body.id}`, 'PUT', { shelf: 3, title: 'O Hobbit — pessoal' });
  assert.equal(update.body.shelf, 3);
  assert.equal(update.body.author, book.author);
  assert.equal(update.body.createdAt, created.body.createdAt);
  assert.equal((await request('/api/items')).body.items[0].title, 'O Hobbit — pessoal');
  assert.equal((await request(`/api/items/${created.body.id}`, 'DELETE')).response.status, 204);
  assert.equal((await request(`/api/items/${created.body.id}`, 'DELETE')).response.status, 404);
  assert.deepEqual((await request('/api/items')).body.items, []);
});

test('stored items survive server restart with the same SQLite directory', async t => {
  const { dataDir, server, request } = await fixture(t);
  const created = (await request('/api/items', 'POST', book)).body;
  await new Promise(resolve => server.close(resolve));
  const restarted = createApp({ dataDir });
  restarted.listen(0, '127.0.0.1');
  await once(restarted, 'listening');
  const response = await fetch(`http://127.0.0.1:${restarted.address().port}/api/items`);
  assert.equal((await response.json()).items[0].id, created.id);
  await new Promise(resolve => restarted.close(resolve));
});

test('validation rejects missing title, invalid ISBN, shelf, colour, type and data types', async t => {
  const { request } = await fixture(t);
  for (const override of [{ title: '' }, { isbn: '9780261102218' }, { shelf: 4 }, { shelf: '1' }, { color: 'red' }, { type: 'anything' }, { title: {} }, { language: '<script>' }, { objectKind: 'anything' }]) {
    assert.equal((await request('/api/items', 'POST', { ...book, ...override })).response.status, 400, JSON.stringify(override));
  }
  assert.equal((await request('/api/items')).body.items.length, 0);
});

test('demo seeding is idempotent, retains personal data and edits to demo items', async t => {
  const { request, base } = await fixture(t);
  await request('/api/items', 'POST', book);
  const first = (await request('/api/demo', 'POST')).body.items;
  assert.equal(first.length, 17);
  assert.equal(first.filter(item => item.type === 'object').length, 5);
  await request('/api/items/demo-book-1', 'PUT', { title: 'O meu título' });
  const second = (await request('/api/demo', 'POST')).body.items;
  assert.equal(second.length, 17);
  assert.equal(second.find(item => item.id === 'demo-book-1').title, 'O meu título');
  const cover = await fetch(`${base}${second.find(item => item.id === 'demo-book-1').coverUrl}`);
  assert.equal(cover.status, 200);
  assert.match(await cover.text(), /CAPA ILUSTRATIVA/);
});

test('external cover URLs are rejected before any network request (SSRF)', async t => {
  let calls = 0;
  const { request } = await fixture(t, { fetchImpl: async () => { calls++; throw new Error('not expected'); } });
  for (const coverUrl of ['http://127.0.0.1/private', 'https://covers.openlibrary.org.evil.test/b/id/1-L.jpg', 'https://covers.openlibrary.org@evil.test/b/id/1-L.jpg', 'https://covers.openlibrary.org/b/id/../../test', '/media/../bookshelf.sqlite']) {
    assert.equal((await request('/api/items', 'POST', { ...book, coverUrl })).response.status, 400);
  }
  assert.equal(calls, 0);
});

test('cover is downloaded once, reused locally and survives without catalogue access', async t => {
  let calls = 0;
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const { request, base, dataDir } = await fixture(t, { fetchImpl: async (url, options) => {
    calls++; assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    assert.match(url, /^https:\/\/covers.openlibrary.org\/b\/id\/123-L.jpg\?default=false$/);
    return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
  } });
  const item = { ...book, coverUrl: 'https://covers.openlibrary.org/b/id/123-L.jpg' };
  const first = (await request('/api/items', 'POST', item)).body;
  assert.match(first.coverUrl, /^\/media\/[a-f0-9]{64}\.jpg$/);
  await request('/api/items', 'POST', item);
  assert.equal(calls, 1);
  assert.deepEqual(readFileSync(join(dataDir, first.coverUrl)), jpeg);
  assert.deepEqual(Buffer.from(await (await fetch(`${base}${first.coverUrl}`)).arrayBuffer()), jpeg);
});

test('failed/oversized/invalid cover preserves book and reports a warning', async t => {
  for (const response of [() => { throw new Error('offline'); }, () => new Response('bad', { headers: { 'Content-Type': 'image/jpeg' } }), () => new Response('too big', { headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '6000000' } })]) {
    const { request } = await fixture(t, { fetchImpl: response });
    const created = await request('/api/items', 'POST', { ...book, coverUrl: 'https://covers.openlibrary.org/b/id/456-L.jpg' });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.coverUrl, '');
    assert.match(created.body.coverWarning, /capa/);
    assert.equal((await request('/api/items')).body.items.length, 1);
  }
});

test('ISBN lookup selects the exact edition and its declared language', async () => {
  const calls = [];
  const result = await lookup({ isbn: '9780261102217' }, async url => {
    calls.push(url);
    return Response.json(url.includes('/authors/') ? { name: 'J. R. R. Tolkien' } : { title: 'O Hobbit', authors: [{ key: '/authors/OL1A' }], languages: [{ key: '/languages/por' }], covers: [123] });
  });
  assert.equal(result.results[0].language, 'pt');
  assert.equal(result.results[0].isbn, '9780261102217');
  assert.equal(result.results[0].author, 'J. R. R. Tolkien');
  assert.equal(calls.length, 2);
});

test('title search never guesses an edition ISBN or language from work results', async () => {
  const result = await lookup({ q: 'O Hobbit Tolkien' }, async () => Response.json({ docs: [{ title: 'The Hobbit', author_name: ['Tolkien'], language: ['eng', 'por'], isbn: ['9780261102217'], cover_i: 42 }] }));
  assert.equal(result.results[0].isbn, '');
  assert.equal(result.results[0].language, '');
  assert.match(result.results[0].editionNote, /outra edição/);
});

test('ISBN lookup follows same-origin edition redirect and rejects external redirects', async () => {
  const calls = [];
  const result = await lookup({ isbn: '9780261102217' }, async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, 'manual');
    return calls.length === 1 ? new Response(null, { status: 302, headers: { Location: '/books/OL123M.json' } }) : Response.json({ title: 'O Hobbit', languages: [{ key: '/languages/por' }] });
  });
  assert.equal(calls[1], 'https://openlibrary.org/books/OL123M.json');
  assert.equal(result.results[0].language, 'pt');
  let unsafeCalls = 0;
  const unsafe = await lookup({ isbn: '9780261102217' }, async () => { unsafeCalls++; return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } }); });
  assert.equal(unsafeCalls, 1);
  assert.deepEqual(unsafe.results, []);
  assert.ok(unsafe.warning);
});

test('catalogue offline returns an actionable warning; invalid ISBN never fetches', async () => {
  let calls = 0;
  const offline = async () => { calls++; throw new Error('network denied'); };
  assert.deepEqual((await lookup({ isbn: '9780261102218' }, offline)).results, []);
  assert.equal(calls, 0);
  const result = await lookup({ q: 'livro' }, offline);
  assert.deepEqual(result.results, []);
  assert.match(result.warning, /manualmente/);
});

test('API blocks cross-origin mutations, rejects oversized bodies and malformed JSON', async t => {
  const { request, base } = await fixture(t);
  assert.equal((await request('/api/items', 'POST', book, { Origin: 'https://malicious.example' })).response.status, 403);
  assert.equal((await request('/api/items', 'POST', book, { Origin: 'http://127.0.0.1:1' })).response.status, 403);
  assert.equal((await request('/api/items', 'POST', book, { Origin: base })).response.status, 201);
  assert.equal((await request('/api/items', 'POST', { ...book, description: 'a'.repeat(34000) })).response.status, 413);
  assert.equal((await fetch(`${base}/api/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })).status, 400);
  assert.equal((await fetch(`${base}/api/items`, { method: 'POST', body: 'text' })).status, 415);
});

test('serves built UI but never exposes database or arbitrary paths', async t => {
  const distDir = mkdtempSync(join(tmpdir(), 'bookshelf-dist-'));
  t.after(() => rmSync(distDir, { recursive: true, force: true }));
  writeFileSync(join(distDir, 'index.html'), '<html>Estante</html>');
  mkdirSync(join(distDir, 'assets'));
  writeFileSync(join(distDir, 'assets', 'app.js'), 'console.log("Estante");');
  const { base } = await fixture(t, { distDir });
  assert.match(await (await fetch(base)).text(), /Estante/);
  assert.equal((await fetch(`${base}/assets/app.js`)).status, 200);
  assert.equal((await fetch(`${base}/media/bookshelf.sqlite`)).status, 404);
  assert.equal((await fetch(`${base}/data/bookshelf.sqlite`)).status, 404);
  assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);
});
