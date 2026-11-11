import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export function demoItems(mediaDir) {
  const books = [
    ['Ensaio sobre a Cegueira', 'José Saramago', '#dbc7a0', 0, 'Literatura portuguesa'],
    ['Harry Potter e a Pedra Filosofal', 'J. K. Rowling', '#763d32', 0, 'Fantasia'],
    ['O Hobbit', 'J. R. R. Tolkien', '#49654e', 0, 'Fantasia'],
    ['A Sombra do Vento', 'Carlos Ruiz Zafón', '#354c5b', 1, 'Romance'],
    ['O Pequeno Príncipe', 'Antoine de Saint-Exupéry', '#a6bfbc', 1, 'Clássicos'],
    ['Os Maias', 'Eça de Queirós', '#a46b47', 1, 'Literatura portuguesa'],
    ['Duna', 'Frank Herbert', '#ce8d47', 2, 'Ficção científica'],
    ['1984', 'George Orwell', '#993f38', 2, 'Ficção científica'],
    ['A Biblioteca da Meia-Noite', 'Matt Haig', '#364b6a', 3, 'Romance'],
    ['Mensagem', 'Fernando Pessoa', '#c3a55f', 3, 'Poesia'],
    ['Orgulho e Preconceito', 'Jane Austen', '#7f8c72', 3, 'Clássicos'],
  ];
  const items = books.map(([title, author, color, shelf, category], index) => {
    const filename = `demo-${index + 1}.svg`;
    const words = title.split(' ');
    const lines = [];
    for (const word of words) {
      if (!lines.length || `${lines.at(-1)} ${word}`.length > 18) lines.push(word);
      else lines[lines.length - 1] += ` ${word}`;
    }
    writeFileSync(join(mediaDir, filename), `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="300" height="450" fill="${color}"/><rect x="15" y="15" width="270" height="420" fill="none" stroke="#ffffff66"/><circle cx="150" cy="285" r="68" fill="none" stroke="#ffffff55" stroke-width="2"/><path d="M80 310 Q150 175 220 310 M105 320 Q150 220 195 320" fill="none" stroke="#ffffff99" stroke-width="2"/><text x="150" y="55" text-anchor="middle" fill="#fff" font-family="Georgia" font-size="13">${escapeXml(author)}</text>${lines.map((line, i) => `<text x="150" y="${112 + i * 30}" text-anchor="middle" fill="#fff" font-family="Georgia" font-size="24">${escapeXml(line)}</text>`).join('')}<text x="150" y="410" text-anchor="middle" fill="#ffffffaa" font-family="sans-serif" font-size="10">CAPA ILUSTRATIVA · DEMONSTRAÇÃO</text></svg>`);
    return { id: `demo-book-${index + 1}`, type: 'book', title, author, isbn: '', language: 'pt', description: 'Livro de demonstração. Capa ilustrativa, não corresponde à capa de uma edição comercial.', category, coverUrl: `/media/${filename}`, shelf, color, objectKind: '' };
  });
  return [...items, ...[
    ['Um pequeno tesouro', 'keepsake', 0, '#8d6349'],
    ['O meu companheiro de leitura', 'plush', 1, '#c99d6b'],
  ].map(([title, objectKind, shelf, color], index) => ({ id: `demo-object-${index + 1}`, type: 'object', title, objectKind, shelf, color, author: '', isbn: '', language: '', description: 'Adereço de demonstração.', category: 'Memórias', coverUrl: '' }))];
}
