import { normalizeIsbn, validIsbn } from './isbn.mjs';

const LANGUAGE = { por: 'pt', eng: 'en', spa: 'es', fre: 'fr', fra: 'fr', ger: 'de', deu: 'de', ita: 'it' };
const languageCode = value => LANGUAGE[value?.split('/').pop()] || value?.split('/').pop() || '';

async function json(url, fetchImpl) {
  const signal = AbortSignal.timeout(7000);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetchImpl(url, { signal, redirect: 'manual', headers: { Accept: 'application/json', 'User-Agent': 'BookShelf-Manager/0.1 (personal home library)' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Catalogue redirect has no destination');
      const target = new URL(location, url);
      if (target.origin !== 'https://openlibrary.org' || target.username || target.password || !/^\/(isbn|books|authors)\/[A-Za-z0-9]+\.json$/.test(target.pathname)) throw new Error('Unsafe catalogue redirect');
      url = target.toString();
      continue;
    }
    if (!response.ok) throw new Error(`catalog status ${response.status}`);
    return response.json();
  }
  throw new Error('Too many catalogue redirects');
}

export async function lookup({ isbn = '', q = '' }, fetchImpl = fetch) {
  isbn = normalizeIsbn(isbn);
  if (isbn && !validIsbn(isbn)) return { results: [], warning: 'ISBN inválido. Confirma os dígitos, incluindo o dígito de controlo.' };
  if (!isbn && !q.trim()) return { results: [], warning: 'Introduz um ISBN ou o título e autor.' };
  try {
    if (isbn) {
      const edition = await json(`https://openlibrary.org/isbn/${isbn}.json`, fetchImpl);
      const authors = await Promise.all((edition.authors || []).slice(0, 4).map(async author => {
        if (!/^\/authors\/[A-Z0-9]+$/.test(author.key || '')) return '';
        try { return (await json(`https://openlibrary.org${author.key}.json`, fetchImpl)).name || ''; } catch { return ''; }
      }));
      return { results: [{ title: edition.title || '', author: authors.filter(Boolean).join(', '), isbn, language: languageCode(edition.languages?.[0]?.key), description: typeof edition.description === 'string' ? edition.description : edition.description?.value || '', coverUrl: edition.covers?.[0] > 0 ? `https://covers.openlibrary.org/b/id/${edition.covers[0]}-L.jpg` : '', source: 'Open Library', editionNote: 'Edição identificada pelo ISBN. Confirma a língua e a capa antes de guardar.' }] };
    }
    const data = await json(`https://openlibrary.org/search.json?q=${encodeURIComponent(q.slice(0, 200))}&limit=8&fields=title,author_name,isbn,language,cover_i,first_publish_year`, fetchImpl);
    return { results: (data.docs || []).map(doc => ({ title: doc.title || '', author: (doc.author_name || []).join(', '), isbn: '', language: '', description: '', coverUrl: doc.cover_i > 0 ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '', source: 'Open Library', editionNote: 'Resultado por obra: língua e capa podem pertencer a outra edição. Usa o ISBN para confirmar a tua edição.' })) };
  } catch {
    return { results: [], warning: 'Não foi possível consultar o catálogo ou encontrar esta edição. Podes preencher os dados manualmente.' };
  }
}
