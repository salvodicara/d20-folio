/** Bounded plain JSON before cloning, including repeated snapshots and UTF-8 storage cost. */
export function assertJsonBudget(
  value: unknown,
  maxBytes: number,
  maxNodes = 4096
): void {
  const fail = (): never => {
    throw new Error("json-budget");
  };
  let nodes = 0;
  const ancestors = new Set<object>();
  const walk = (v: unknown, depth: number): void => {
    if (++nodes > maxNodes || depth > 40) fail();
    if (v === null || typeof v === "string" || typeof v === "boolean") return;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) fail();
      return;
    }
    if (typeof v !== "object" || ancestors.has(v)) return fail();
    ancestors.add(v);
    if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else {
      if (![Object.prototype, null].includes(Object.getPrototypeOf(v) as object | null))
        fail();
      for (const [key, x] of Object.entries(v)) {
        if (["__proto__", "prototype", "constructor", "attachments"].includes(key))
          fail();
        walk(x, depth + 1);
      }
    }
    ancestors.delete(v);
  };
  walk(value, 0);
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) fail();
}
