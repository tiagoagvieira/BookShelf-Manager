import { test, expect } from '@playwright/test';

// The Playwright webServer uses an isolated temporary DATA_DIR. Never point
// these destructive fixture resets at a personal or production collection.
test.beforeEach(async ({ request, page }) => {
  const response = await request.get('/api/items');
  expect(response.ok()).toBeTruthy();
  const { items } = await response.json();
  for (const item of items) {
    const removed = await request.delete(`/api/items/${item.id}`);
    expect(removed.status()).toBe(204);
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'O primeiro capítulo é seu.' })).toBeVisible();
});

async function openManualBook(page) {
  await page.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Manualmente', exact: true }).click();
  return dialog;
}

async function saveBook(page, title = 'O livro de teste') {
  const dialog = await openManualBook(page);
  await dialog.getByLabel('Título', { exact: false }).fill(title);
  await dialog.getByLabel('Autor', { exact: true }).fill('Autora de Teste');
  await dialog.getByLabel('Idioma da edição').selectOption('pt');
  await dialog.getByLabel('Prateleira', { exact: true }).selectOption('2');
  await dialog.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: `Ver ${title}`, exact: true })).toBeVisible();
}

test('demonstração é repetível e preserva livros pessoais', async ({ page, request }) => {
  await saveBook(page, 'A minha memória');
  await page.getByRole('button', { name: 'Carregar demonstração' }).click();
  await expect(page.getByRole('button', { name: 'Ver O Hobbit', exact: true })).toBeVisible();
  const first = (await (await request.get('/api/items')).json()).items;
  expect(first.some(item => item.type === 'object')).toBeTruthy();
  expect(first.some(item => item.type === 'book')).toBeTruthy();
  await page.getByRole('button', { name: 'Carregar demonstração' }).click();
  await expect(page.getByRole('button', { name: 'Carregar demonstração' })).toBeEnabled();
  const second = (await (await request.get('/api/items')).json()).items;
  expect(second).toHaveLength(first.length);
  expect(second.filter(item => item.title === 'A minha memória')).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Ver A minha memória', exact: true })).toBeVisible();
});

test('criar, pesquisar, editar e eliminar um livro persistente', async ({ page }) => {
  await saveBook(page);
  await page.reload();
  await page.getByLabel('Pesquisar na estante').fill('sem correspondência');
  await expect(page.getByRole('heading', { name: 'Nenhuma história por aqui.' })).toBeVisible();
  await page.getByLabel('Pesquisar na estante').fill('Autora de Teste');
  await page.getByRole('button', { name: 'Ver O livro de teste', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Prateleira 3', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Editar detalhes' }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Título', { exact: false }).fill('O livro revisto');
  await dialog.getByLabel('Idioma da edição').selectOption('en');
  await dialog.getByLabel('Prateleira', { exact: true }).selectOption('1');
  await dialog.getByRole('button', { name: 'Guardar alterações' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Ver O livro revisto', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Inglês', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Prateleira 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Remover da coleção', exact: true }).click();
  await page.getByRole('button', { name: 'Sim, remover' }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'O primeiro capítulo é seu.' })).toBeVisible();
});

test('adereços têm tipo, notas e posição persistentes', async ({ page, request }) => {
  await page.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Adereço', exact: true }).click();
  await dialog.getByLabel('Nome do adereço', { exact: false }).fill('Medalha de Lisboa');
  await dialog.getByLabel('Tipo de adereço').selectOption('trophy');
  await dialog.getByLabel('Prateleira', { exact: true }).selectOption('3');
  await dialog.getByLabel('Notas e memórias').fill('A primeira meia maratona.');
  await dialog.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Ver Medalha de Lisboa', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('A primeira meia maratona.')).toBeVisible();
  const { items } = await (await request.get('/api/items')).json();
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({ type: 'object', objectKind: 'trophy', shelf: 3 });
});

test('ISBN preenche edição e permite confirmar a língua antes de guardar', async ({ page, request }) => {
  await page.route('**/api/lookup?isbn=*', route => route.fulfill({
    json: { results: [{ title: 'Livro de catálogo', author: 'Autor Exemplo', isbn: '9789720049575', language: 'en', coverUrl: '' }] },
  }));
  await page.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('ISBN', { exact: true }).first().fill('9789720049575');
  await dialog.getByRole('button', { name: 'Procurar edição' }).click();
  await dialog.getByRole('button', { name: /Livro de catálogo/ }).click();
  await expect(dialog.getByLabel('Idioma da edição')).toHaveValue('en');
  await dialog.getByLabel('Idioma da edição').selectOption('pt');
  await dialog.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const { items } = await (await request.get('/api/items')).json();
  expect(items[0]).toMatchObject({ title: 'Livro de catálogo', isbn: '9789720049575', language: 'pt' });
});

test('pesquisa título e autor envia ambos e falha do catálogo permite criação manual', async ({ page }) => {
  let queried;
  await page.route('**/api/lookup?q=*', route => {
    queried = new URL(route.request().url()).searchParams.get('q');
    return route.fulfill({ json: { results: [], warning: 'Catálogo temporariamente indisponível.' } });
  });
  await page.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Título e autor', exact: true }).click();
  await dialog.getByLabel('Título do livro', { exact: true }).fill('Os Maias');
  await dialog.getByLabel('Autor para a pesquisa', { exact: true }).fill('Eça de Queirós');
  await dialog.getByRole('button', { name: 'Procurar edição' }).click();
  await expect(dialog.getByText('Catálogo temporariamente indisponível.')).toBeVisible();
  expect(queried).toBe('Os Maias Eça de Queirós');
  await dialog.getByRole('button', { name: 'Manualmente', exact: true }).click();
  await dialog.getByLabel('Título', { exact: false }).fill('Os Maias');
  await dialog.getByLabel('Autor', { exact: true }).fill('Eça de Queirós');
  await dialog.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver Os Maias', exact: true })).toBeVisible();
});

test('câmara recusada mantém alternativa manual funcional', async ({ page }) => {
  await page.addInitScript(() => {
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')),
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Ler com a câmara' }).click();
  await expect(dialog.getByText(/O acesso à câmara foi recusado/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Fechar câmara' }).click();
  await dialog.getByRole('button', { name: 'Manualmente', exact: true }).click();
  await expect(dialog.getByLabel('Título', { exact: false })).toBeEditable();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
});

test('modo móvel permite navegar coleção e formulário sem transbordo horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Explorar demonstração' }).click();
  await expect(page.getByRole('button', { name: 'Ver O Hobbit', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await page.getByRole('button', { name: 'Vista de lista' }).click();
  await page.getByLabel('Pesquisar na estante').fill('Saramago');
  await page.getByRole('button', { name: /Ensaio sobre a Cegueira/ }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Ensaio sobre a Cegueira' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  const box = await page.getByRole('dialog').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

// Render an actual EAN-13 image into a synthetic video stream. The application's
// real ZXing decoder still has to recognise it; only the hardware is replaced.
function ean13Bits(isbn) {
  const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
  const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
  const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
  const parity = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'][Number(isbn[0])];
  const left = [...isbn.slice(1, 7)].map((n, i) => (parity[i] === 'L' ? L : G)[Number(n)]).join('');
  const right = [...isbn.slice(7)].map(n => R[Number(n)]).join('');
  return `101${left}01010${right}101`;
}

test('câmara descodifica um EAN-13 real num vídeo sintético e liberta a stream', async ({ page }) => {
  const isbn = '9789720049575';
  await page.addInitScript(({ bits, isbn }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      [...bits].forEach((bit, i) => { if (bit === '1') ctx.fillRect(195 + i * 6, 100, 6, 300); });
      ctx.font = '28px monospace';
      ctx.fillText(isbn, 340, 440);
    };
    draw();
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const stream = canvas.captureStream(10);
        window.__scannerTrack = stream.getVideoTracks()[0];
        const repaint = setInterval(draw, 100);
        window.__scannerTrack.addEventListener('ended', () => clearInterval(repaint));
        return stream;
      },
    });
  }, { bits: ean13Bits(isbn), isbn });
  let queriedISBN;
  await page.route('**/api/lookup?isbn=*', route => {
    queriedISBN = new URL(route.request().url()).searchParams.get('isbn');
    return route.fulfill({ json: { results: [{ title: 'O livro lido pela câmara', author: 'Autor', isbn, language: 'pt', coverUrl: '' }] } });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Ler com a câmara' }).click();
  await expect(dialog.getByRole('button', { name: /O livro lido pela câmara/ })).toBeVisible({ timeout: 15000 });
  expect(queriedISBN).toBe(isbn);
  await expect(dialog.getByLabel('ISBN', { exact: true }).last()).toHaveValue(isbn);
  await expect.poll(() => page.evaluate(() => window.__scannerTrack?.readyState)).toBe('ended');
  await expect(dialog.getByRole('button', { name: 'Fechar câmara' })).not.toBeVisible();
});

test('resultado sem língua mantém a edição por confirmar', async ({ page, request }) => {
  await page.route('**/api/lookup?q=*', route => route.fulfill({ json: {
    results: [{ title: 'Uma obra sem edição', author: 'Autora', language: '', isbn: '', coverUrl: '', editionNote: 'A capa pode pertencer a outra edição.' }],
  } }));
  await page.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Título e autor', exact: true }).click();
  await dialog.getByLabel('Título do livro', { exact: true }).fill('Uma obra sem edição');
  await dialog.getByRole('button', { name: 'Procurar edição' }).click();
  await dialog.getByRole('button', { name: /Uma obra sem edição/ }).click();
  await expect(dialog.getByLabel('Idioma da edição')).toHaveValue('');
  await expect(dialog.getByText(/A capa pode pertencer a outra edição/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Adicionar à estante', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const { items } = await (await request.get('/api/items')).json();
  expect(items[0].language).toBe('');
});

test('avisa quando o livro foi guardado mas a capa não pôde ser descarregada', async ({ page, request }) => {
  const warning = 'Não foi possível guardar a capa. Os dados do livro foram guardados.';
  await page.route('**/api/items', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    const response = await route.fetch();
    const item = await response.json();
    return route.fulfill({ response, json: { ...item, coverWarning: warning } });
  });
  await saveBook(page, 'Livro sem capa');
  await expect(page.getByRole('status')).toContainText(warning);
  const { items } = await (await request.get('/api/items')).json();
  expect(items).toHaveLength(1);
  expect(items[0].title).toBe('Livro sem capa');
});

test('composição mostra cinco colunas e quatro portas sem duplicar a coleção', async ({page,request}) => {
  await page.getByRole('button',{name:'Explorar demonstração'}).click();
  await expect(page.locator('.cabinet-column')).toHaveCount(5);
  await expect(page.locator('.cabinet-column.open-center')).toHaveCount(1);
  await expect(page.locator('.solid-door-panel')).toHaveCount(4);
  const {items}=await (await request.get('/api/items')).json();
  await expect(page.locator('.cabinet-wall button.shelf-item')).toHaveCount(items.length);
  await page.getByRole('button',{name:'Fechar portas de vidro'}).click();
  await expect(page.locator('.cabinet-wall')).toHaveClass(/doors-closed/);
  await page.getByRole('button',{name:'Abrir portas de vidro'}).click();
  await page.getByRole('button',{name:'Ver O Hobbit',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});
