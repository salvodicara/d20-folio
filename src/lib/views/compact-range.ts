/**
 * A spell's range, compact for a table column: «Sé · 4,5 m», "Self · 15 ft", «18 m».
 * The catalogue's full text («Sé stessi (emanazione di 4,5 metri)») stays the cell's
 * tooltip; a word range (Contatto, Touch, Sight) is left as it is.
 */
const UNIT: ReadonlyArray<[RegExp, string]> = [
  [/^(?:metri|metro)$/i, "m"],
  [/^(?:chilometri|chilometro|km)$/i, "km"],
  [/^(?:feet|foot)$/i, "ft"],
  [/^(?:miles|mile)$/i, "mi"],
];

const unitOf = (word: string): string | null =>
  UNIT.find(([re]) => re.test(word))?.[1] ?? null;

/** The first distance in the text: its number and short unit. */
function distance(text: string): string | null {
  const m =
    /(\d+(?:[.,]\d+)?)[\s-]+(metri|metro|chilometri|chilometro|km|feet|foot|miles|mile)\b/i.exec(
      text
    );
  if (!m?.[1] || !m[2]) return null;
  const unit = unitOf(m[2]);
  return unit ? `${m[1]} ${unit}` : null;
}

/** A compact range for its column: each distance («1,5 m», «Sé») keeps its line, so a
 *  narrow column wraps only between distances, at « / » or « · ». A part longer than a
 *  distance (a range in words) keeps its ordinary spaces and wraps freely. */
export function rangeCellText(compact: string): string {
  return compact
    .split(/( \/ | · )/)
    .map((part, i) => (i % 2 === 0 && part.length <= 12 ? part.replace(/ /g, " ") : part))
    .join("");
}

export function compactRange(text: string): string {
  const self = /^s[eé] stessi\b/i.test(text)
    ? "Sé"
    : /^self\b/i.test(text)
      ? "Self"
      : null;
  const d = distance(text);
  if (self) return d ? `${self} · ${d}` : self;
  return d ?? text;
}
