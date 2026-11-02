/** The first letter of a name, upper-cased (whole graphemes, so accents and ligatures stay intact). */
export function initialOf(name: string): string {
  const first = new Intl.Segmenter().segment(name.trim())[Symbol.iterator]().next();
  return first.done ? "" : first.value.segment.toLocaleUpperCase();
}
