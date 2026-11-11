// The small tolerance covers subpixel rounding and the spacing between spines.
export function supportedTop(left, right, supports, tolerance = 2) {
  const sorted = supports.filter(book => book.right > left && book.left < right)
    .sort((a, b) => a.left - b.left);
  if (!sorted.length) return null;
  const top = Math.min(...sorted.map(book => book.top));
  let covered = left;
  for (const book of sorted) {
    if (Math.abs(book.top - top) > tolerance) continue;
    if (book.left > covered + tolerance) return null;
    covered = Math.max(covered, book.right);
    if (covered >= right - tolerance) return top;
  }
  return null;
}
