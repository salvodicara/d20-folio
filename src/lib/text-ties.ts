/** A name wraps without leaving its last word alone. */
export const tieLast = (text: string) => text.replace(/ (\S+)$/, "\u00a0$1");

/**
 * Each line of prose ends on its last words together, never on a lone word: two by
 * default, `words` in a narrow column where two still leave a short last line.
 */
export const tieTails = (md: string, words = 2) =>
  md
    .split("\n")
    .map((line) => {
      if (line.startsWith("|")) return line;
      let out = line;
      for (let n = 1; n < words; n++)
        out = out.replace(/ (\S+(?:\u00a0\S+)*)$/, "\u00a0$1");
      return out;
    })
    .join("\n");
