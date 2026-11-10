export function normalizeIsbn(value = '') {
  return String(value).replace(/[\s-]/g, '').toUpperCase();
}

export function validIsbn(value) {
  const isbn = normalizeIsbn(value);
  if (/^\d{9}[\dX]$/.test(isbn)) {
    return [...isbn].reduce((sum, c, i) => sum + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0;
  }
  return /^97[89]\d{10}$/.test(isbn) && [...isbn].reduce((sum, c, i) => sum + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0;
}
