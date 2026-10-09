/**
 * srd-catalogue — the public, static SRD catalogue (Folio Core API step 3): every SRD
 * collection as one JSON file of entries (the structured mechanics the engine runs on,
 * plus the canonical English text under `text`), and an index with counts, licence and
 * the SRD 5.2.1 attribution. Anyone can build a D&D tool on it without the app.
 *
 * Pure and deterministic: entries sorted by id, object keys sorted, functions and
 * `undefined` dropped, so two exports of the same data are byte-identical and diffs
 * show only real changes. It refuses a duplicate id and any top-level `source` other
 * than "SRD" — the private content pack must never reach this file (the export script
 * also runs SRD-only). Used by `scripts/export-srd-catalogue.ts`.
 */

/** One collection to export: its entries and their English text catalogue. */
export interface CatalogueCollection {
  entries: readonly { readonly id: string }[];
  /** `id → fields` plus dotted sub-keys (`aid.components`), as `src/i18n/en/srd/*.json`. */
  text?: Readonly<Record<string, unknown>>;
}

export interface CatalogueInput {
  version: string;
  attribution: string;
  collections: Readonly<Record<string, CatalogueCollection>>;
}

export interface CatalogueIndex {
  version: string;
  license: "CC-BY-4.0";
  attribution: string;
  collections: Record<string, { file: string; count: number }>;
}

export interface CatalogueOutput {
  index: CatalogueIndex;
  /** File name → its entries. */
  files: Record<string, unknown[]>;
}

/** Plain JSON with keys sorted at every depth (functions and `undefined` dropped). */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v === undefined || typeof v === "function") continue;
    out[key] = canonical(v);
  }
  return out;
}

/** Group a text catalogue by entry id: `aid` fields plus `aid.<field>` sub-keys. */
function textById(
  text: Readonly<Record<string, unknown>>
): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  for (const [key, value] of Object.entries(text)) {
    const dot = key.indexOf(".");
    const id = dot === -1 ? key : key.slice(0, dot);
    const fields = byId.get(id) ?? {};
    if (dot === -1) {
      if (value !== null && typeof value === "object") Object.assign(fields, value);
    } else {
      fields[key.slice(dot + 1)] = value;
    }
    byId.set(id, fields);
  }
  return byId;
}

export function buildSrdCatalogue(input: CatalogueInput): CatalogueOutput {
  const files: Record<string, unknown[]> = {};
  const collections: CatalogueIndex["collections"] = {};
  const named = Object.entries(input.collections).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  for (const [name, { entries, text }] of named) {
    const texts = text ? textById(text) : new Map<string, Record<string, unknown>>();
    const seen = new Set<string>();
    const out = [...entries]
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .map((entry) => {
        if (seen.has(entry.id)) throw new Error(`duplicate ${name} id "${entry.id}"`);
        seen.add(entry.id);
        const source = (entry as { source?: unknown }).source;
        if (source !== undefined && source !== "SRD") {
          throw new Error(
            `${name} "${entry.id}" is not SRD (source ${JSON.stringify(source)})`
          );
        }
        const fields = texts.get(entry.id);
        return canonical(fields ? { ...entry, text: fields } : entry);
      });
    const file = `${name}.json`;
    files[file] = out;
    collections[name] = { file, count: out.length };
  }
  return {
    index: {
      version: input.version,
      license: "CC-BY-4.0",
      attribution: input.attribution,
      collections,
    },
    files,
  };
}
