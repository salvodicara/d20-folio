/** A name wraps without leaving its last word alone. */
export const tieLast = (text: string) => text.replace(/ (\S+)$/, " $1");

/** Each line of prose ends on its last two words together, never on a lone word. */
export const tieTails = (md: string) =>
  md
    .split("\n")
    .map((line) => (line.startsWith("|") ? line : line.replace(/ (\S+)$/, " $1")))
    .join("\n");
