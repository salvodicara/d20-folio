/**
 * One minimal, schema-valid sample per Grant schema branch, generated from the
 * exact schema itself — so a new kind or branch gets a sample with no hand edit.
 * Shared by the conformer contract and the homebrew-expressibility guard.
 */
import type { ExactSchema } from "@/lib/exact-schema";
import { GRANT_SCHEMA } from "@/lib/grant-schema";

export function sample(schema: ExactSchema): unknown {
  switch (schema.kind) {
    case "string":
      return "x";
    case "number":
      return 1;
    case "boolean":
      return true;
    case "literal":
      return schema.value;
    case "array":
      return schema.minItems === undefined
        ? []
        : Array.from({ length: schema.minItems }, () => sample(schema.item));
    case "tuple":
      return schema.items.map(sample);
    case "record":
      return {};
    case "object":
      return Object.fromEntries(
        Object.entries(schema.required)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, sample(child)])
      );
    case "union": {
      const first = schema.variants[0];
      if (!first) throw new TypeError("empty schema union");
      return sample(first);
    }
    case "discriminated-union": {
      const first = Object.values(schema.variants)[0];
      if (!first) throw new TypeError("empty discriminated schema union");
      return sample(first);
    }
    case "ref":
      return { range: 60, type: "darkvision" };
    case "custom":
      switch (schema.name) {
        case "proficiency-token":
          return "x";
        case "resource-selector":
          return { kind: "pool", owner: "owner", resourceId: "x" };
        case "resource-spec":
          return {
            kind: "count",
            id: "x",
            capacity: { kind: "bounded", amount: { kind: "fixed", value: 1 } },
            initial: { kind: "full" },
            recoveries: [],
          };
        case "resource-term":
          return {
            selector: { kind: "pool", owner: "owner", resourceId: "x" },
            amount: { kind: "fixed", value: 1 },
          };
        default:
          throw new TypeError(`missing custom sample: ${schema.name}`);
      }
  }
}

export function schemaBranches(): Array<{
  readonly label: string;
  readonly schema: ExactSchema;
}> {
  const result: Array<{ readonly label: string; readonly schema: ExactSchema }> = [];
  const variants: Readonly<Record<string, ExactSchema>> = GRANT_SCHEMA.variants;
  for (const [kind, schema] of Object.entries(variants)) {
    if (schema.kind === "union") {
      schema.variants.forEach((branch, index) => {
        result.push({ label: `${kind}[${index}]`, schema: branch });
      });
    } else {
      result.push({ label: kind, schema });
    }
  }
  return result;
}
