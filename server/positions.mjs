import { randomInt } from 'node:crypto';

export function originalCabinet(item) {
  if (item.type === 'object') return 2;
  const demoIndex = /^demo-book-(\d+)$/.exec(item.id);
  if (demoIndex) return [0, 3, 1, 4][Math.min(3, Math.floor((Number(demoIndex[1]) - 1) / 3))];
  let hash = 0;
  for (const character of item.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return [0, 1, 3, 4][hash % 4];
}

export function organize(items, mode) {
  const groups = Map.groupBy(items, item => `${item.cabinet}:${item.shelf}`);
  const collator = new Intl.Collator('pt-PT', { sensitivity: 'base', numeric: true });
  for (const group of groups.values()) {
    if (mode === 'random') {
      for (let index = group.length - 1; index > 0; index--) {
        const other = randomInt(index + 1);
        [group[index], group[other]] = [group[other], group[index]];
      }
    } else {
      group.sort((a, b) => (mode === 'author' && collator.compare(a.author || '\uffff', b.author || '\uffff')) || collator.compare(a.title, b.title));
    }
    group.forEach((item, order) => { item.order = order; });
  }
}
