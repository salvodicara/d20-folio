/**
 * The causal undo of a commit: what it changed, taken back field by field, and nothing
 * else. `causalPatch(before, after)` records each changed value; `undoPatch(current,
 * patch)` puts back the prior value of each field the commit changed, keeping every field
 * someone else changed since (the DM's hit, a player's later use). Undo refuses (`null`)
 * when someone changed a field the commit changed too: it never overwrites their change.
 *
 * Plain objects compare key by key. A list whose items all carry a unique string `id`
 * (the log) compares item by item, so an undo takes out only the lines its commit added
 * and puts back, where they were, the lines it removed. Any other list (the inventory,
 * the active-state chips) compares by content: undo removes the exact items the commit
 * added and puts back the ones it removed next to the item they followed.
 */

type Segment = string | { id: string };
type Path = readonly Segment[];

export type PatchChange =
  | {
      kind: "set";
      path: Path;
      before?: unknown;
      hadBefore: boolean;
      after?: unknown;
      hasAfter: boolean;
    }
  | { kind: "added"; path: Path; id: string; item: unknown }
  | { kind: "removed"; path: Path; id: string; item: unknown; afterId: string | null }
  | { kind: "list-added"; path: Path; item: unknown }
  | {
      kind: "list-removed";
      path: Path;
      item: unknown;
      index: number;
      after?: unknown;
      hasAfter: boolean;
    };

export type CausalPatch = readonly PatchChange[];

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Keyed = Array<Plain & { id: string }>;

function isKeyed(value: unknown): value is Keyed {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  for (const item of value) {
    if (!isPlain(item) || typeof item.id !== "string" || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return true;
}

/**
 * An absent field, an empty list and an empty map mean the same on the sheet: its save
 * drops empty values, so a field a commit created as `[]` can come back absent. They
 * count as absent everywhere here, or the undo would see the save as someone's change.
 */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return value === undefined;
  if (Array.isArray(value)) return value.length === 0;
  return isPlain(value) && Object.values(value).every(isEmpty);
}

/** JSON with sorted keys and absent fields dropped (and empty ones, when they count as absent). */
function canonical(value: unknown, emptyIsAbsent: boolean): string {
  if (Array.isArray(value))
    return `[${value.map((inner) => canonical(inner, emptyIsAbsent)).join(",")}]`;
  if (isPlain(value)) {
    const entries = Object.entries(value)
      .filter(([, inner]) => (emptyIsAbsent ? !isEmpty(inner) : inner !== undefined))
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries
      .map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner, emptyIsAbsent)}`)
      .join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

/** The same fact (empty = absent): what a conflict check compares. */
const same = (left: unknown, right: unknown): boolean =>
  canonical(left, true) === canonical(right, true);
/** The same shape: what a recorded change keeps, so undo restores it exactly. */
const identical = (left: unknown, right: unknown): boolean =>
  canonical(left, false) === canonical(right, false);

/** Every change from `before` to `after`, outermost first. */
export function causalPatch(before: unknown, after: unknown): CausalPatch {
  const changes: PatchChange[] = [];
  diff(before, true, after, true, [], changes);
  return changes;
}

function diff(
  before: unknown,
  hadBefore: boolean,
  after: unknown,
  hasAfter: boolean,
  path: Path,
  out: PatchChange[]
): void {
  if (hadBefore === hasAfter && (before === after || identical(before, after))) return;
  if (hadBefore && hasAfter && isPlain(before) && isPlain(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of keys) {
      const b = before[key];
      const a = after[key];
      diff(b, b !== undefined, a, a !== undefined, [...path, key], out);
    }
    return;
  }
  if (hadBefore && hasAfter && isKeyed(before) && isKeyed(after)) {
    const afterIds = new Set(after.map((item) => item.id));
    const beforeById = new Map(before.map((item) => [item.id, item]));
    before.forEach((item, index) => {
      if (!afterIds.has(item.id)) {
        out.push({
          kind: "removed",
          path,
          id: item.id,
          item: structuredClone(item),
          afterId: index > 0 ? (before[index - 1]?.id ?? null) : null,
        });
      }
    });
    for (const item of after) {
      const prior = beforeById.get(item.id);
      if (prior === undefined) {
        out.push({ kind: "added", path, id: item.id, item: structuredClone(item) });
      } else diff(prior, true, item, true, [...path, { id: item.id }], out);
    }
    return;
  }
  if (hadBefore && hasAfter && Array.isArray(before) && Array.isArray(after)) {
    diffList(before, after, path, out);
    return;
  }
  out.push({
    kind: "set",
    path,
    ...(hadBefore ? { before: structuredClone(before) } : {}),
    hadBefore,
    ...(hasAfter ? { after: structuredClone(after) } : {}),
    hasAfter,
  });
}

/** A list without ids, by content: the longest common run stays, the rest is removed
 *  from `before` or added in `after`. */
function diffList(
  before: unknown[],
  after: unknown[],
  path: Path,
  out: PatchChange[]
): void {
  const b = before.map((item) => canonical(item, false));
  const a = after.map((item) => canonical(item, false));
  // run(i, j): the longest common run of b[i..] and a[j..], in one flat table.
  const width = a.length + 1;
  const table = new Array<number>((b.length + 1) * width).fill(0);
  const run = (i: number, j: number): number => table[i * width + j] ?? 0;
  for (let i = b.length - 1; i >= 0; i--) {
    for (let j = a.length - 1; j >= 0; j--) {
      table[i * width + j] =
        b[i] === a[j] ? run(i + 1, j + 1) + 1 : Math.max(run(i + 1, j), run(i, j + 1));
    }
  }
  const removed: PatchChange[] = [];
  const added: PatchChange[] = [];
  let i = 0;
  let j = 0;
  while (i < b.length || j < a.length) {
    if (i < b.length && j < a.length && b[i] === a[j]) {
      i++;
      j++;
    } else if (j >= a.length || (i < b.length && run(i + 1, j) >= run(i, j + 1))) {
      removed.push({
        kind: "list-removed",
        path,
        item: structuredClone(before[i]),
        index: i,
        ...(i > 0 ? { after: structuredClone(before[i - 1]) } : {}),
        hasAfter: i > 0,
      });
      i++;
    } else {
      added.push({ kind: "list-added", path, item: structuredClone(after[j]) });
      j++;
    }
  }
  // Undo runs in reverse: the added items come out first, then the removed go back.
  out.push(...removed, ...added);
}

/** The container a path leads to and the last step into it, or null when it is gone. */
function locate(root: Plain, path: Path): { parent: unknown; step: Segment } | null {
  let node: unknown = root;
  for (const segment of path.slice(0, -1)) {
    node = child(node, segment);
    if (node === undefined) return null;
  }
  const step = path[path.length - 1];
  return step === undefined ? null : { parent: node, step };
}

function child(node: unknown, segment: Segment): unknown {
  if (typeof segment === "string") return isPlain(node) ? node[segment] : undefined;
  return Array.isArray(node)
    ? node.find((item: unknown) => isPlain(item) && item.id === segment.id)
    : undefined;
}

function listAt(root: Plain, path: Path): unknown[] | null {
  let node: unknown = root;
  for (const segment of path) {
    node = child(node, segment);
    if (node === undefined) return null;
  }
  return Array.isArray(node) ? node : null;
}

/**
 * `current` with the patched commit taken back, or null when someone else changed a
 * field the commit changed. Pure: `current` is not mutated.
 */
export function undoPatch<T>(current: T, patch: CausalPatch): T | null {
  if (!isPlain(current)) return null;
  const next = structuredClone(current) as Plain;
  for (const change of [...patch].reverse()) {
    if (!undoOne(next, change)) return null;
  }
  return next as T;
}

function undoOne(root: Plain, change: PatchChange): boolean {
  if (change.kind === "set") {
    if (change.path.length === 0) return false;
    const at = locate(root, change.path);
    if (!at) return false;
    const { parent, step } = at;
    if (typeof step !== "string" || !isPlain(parent)) return false;
    // Compared as facts (empty = absent); restored exactly as it was, an empty list
    // included, since code reads a required list without a guard.
    const now = parent[step];
    const present = !isEmpty(now);
    const expected = change.hasAfter && !isEmpty(change.after);
    if (present !== expected || (present && !same(now, change.after))) return false;
    if (change.hadBefore) parent[step] = structuredClone(change.before);
    else Reflect.deleteProperty(parent, step);
    return true;
  }
  const list = listAt(root, change.path);
  if (!list) return false;
  if (change.kind === "list-added") {
    const at = list.findIndex((item) => same(item, change.item));
    if (at < 0) return false; // changed or removed since: not this commit's to take back
    list.splice(at, 1);
    return true;
  }
  if (change.kind === "list-removed") {
    const anchor = change.hasAfter
      ? list.findIndex((item) => same(item, change.after))
      : -1;
    const at = !change.hasAfter
      ? 0
      : anchor >= 0
        ? anchor + 1
        : Math.min(change.index, list.length);
    list.splice(at, 0, structuredClone(change.item));
    return true;
  }
  const index = list.findIndex((item) => isPlain(item) && item.id === change.id);
  if (change.kind === "added") {
    if (index < 0) return true; // already gone
    if (!same(list[index], change.item)) return false;
    list.splice(index, 1);
    return true;
  }
  if (index >= 0) return same(list[index], change.item);
  const anchor =
    change.afterId === null
      ? -1
      : list.findIndex((item) => isPlain(item) && item.id === change.afterId);
  list.splice(
    change.afterId === null ? 0 : anchor < 0 ? list.length : anchor + 1,
    0,
    structuredClone(change.item)
  );
  return true;
}
