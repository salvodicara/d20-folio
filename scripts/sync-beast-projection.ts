/**
 * sync-beast-projection — the campaign-scoped generator (golden rule 10; `git rm`'d
 * in the final wave once the projection guard's completeness assertion makes it
 * spent). ONE generator every data wave runs, so the eager Polymorph catalogue
 * (`src/data/beasts/beasts.ts`) is a GENERATED 2024 projection of the monster
 * corpus — never hand-maintained (D-5, §D.3). The shared derivation
 * (`scripts/beast-projection.ts`) is NOT retired: the guard owns it forever.
 *
 * Run: `node scripts/sync-beast-projection.ts` — relative imports only, no `@`
 * aliases. The beast + monster tranche files import ONLY types, which node's
 * type-stripping erases, so plain node loads them without the alias loader.
 *
 * One run, mechanically:
 *  1. Regenerate `beasts.ts` wholesale — every beast whose monster exists is emitted
 *     as `beastProjectionFromMonster(monster)`; the rest serialize unchanged (mid-
 *     campaign). Sorted (cr, id), uniform per-entry source comment, generated header.
 *     Formatted with `pnpm exec prettier --write` (never npx).
 *  2. Sync `src/i18n/{en,it}/srd/beasts.json` — the referenced `attack.*` / `trait.*`
 *     / `<id>` key set of the regenerated array is inserted (names pulled from the
 *     wave's `monsters.json`) and pruned in BOTH locales; every intersecting beast's
 *     name/attack/trait lexeme is unified to its monster's catalogue name.
 *  3. Fail LOUD (exit 1) on an IT shared-key collision — two monsters localizing the
 *     same shared entry id (e.g. `attack.bite`) differently — for manual adjudication
 *     against the IT SRD, never a silent pick.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beastProjectionFromMonster } from "./beast-projection.ts";
import { BEASTS as PUBLIC_BEASTS } from "../src/data/beasts/beasts.ts";
import { SRD_MONSTERS_A_B } from "../src/data/monsters/a-b.ts";
import { SRD_MONSTERS_C_D } from "../src/data/monsters/c-d.ts";
import { SRD_MONSTERS_E_G } from "../src/data/monsters/e-g.ts";
import { SRD_MONSTERS_H_K } from "../src/data/monsters/h-k.ts";
import { SRD_MONSTERS_L_M } from "../src/data/monsters/l-m.ts";
import { SRD_MONSTERS_N_P } from "../src/data/monsters/n-p.ts";
import { SRD_MONSTERS_Q_S } from "../src/data/monsters/q-s.ts";
import { SRD_MONSTERS_T_Z } from "../src/data/monsters/t-z.ts";
import { formatCr } from "../src/lib/utils.ts";
import type { BeastStatBlock, MonsterStatBlock } from "../src/data/types.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const BEASTS_TS = resolve(ROOT, "src/data/beasts/beasts.ts");
const EN_JSON = resolve(ROOT, "src/i18n/en/srd/beasts.json");
const IT_JSON = resolve(ROOT, "src/i18n/it/srd/beasts.json");
const EN_MONSTERS = resolve(ROOT, "src/i18n/en/srd/monsters.json");
const IT_MONSTERS = resolve(ROOT, "src/i18n/it/srd/monsters.json");

type Leaf = { name: string; text?: string };
type Catalogue = Record<string, Leaf>;

const readJson = (p: string): Catalogue =>
  JSON.parse(readFileSync(p, "utf8")) as Catalogue;

const MONSTERS: ReadonlyArray<MonsterStatBlock> = [
  ...SRD_MONSTERS_A_B,
  ...SRD_MONSTERS_C_D,
  ...SRD_MONSTERS_E_G,
  ...SRD_MONSTERS_H_K,
  ...SRD_MONSTERS_L_M,
  ...SRD_MONSTERS_N_P,
  ...SRD_MONSTERS_Q_S,
  ...SRD_MONSTERS_T_Z,
];
const monsterById = new Map(MONSTERS.map((m) => [m.id, m]));

// ── 1. Regenerate the beast array (projected where the monster exists) ─────────
const beasts: BeastStatBlock[] = PUBLIC_BEASTS.map((b) => {
  const m = monsterById.get(b.id);
  return m ? beastProjectionFromMonster(m) : b;
}).sort((a, b) => a.cr - b.cr || a.id.localeCompare(b.id));

// ── 2. Sync the beasts.json catalogues (both locales) ──────────────────────────
const enBeasts = readJson(EN_JSON);
const itBeasts = readJson(IT_JSON);
const enMon = readJson(EN_MONSTERS);
const itMon = readJson(IT_MONSTERS);

/** The set of catalogue keys the regenerated array references. */
const referenced = new Set<string>();
for (const b of beasts) {
  referenced.add(b.id);
  for (const a of b.attacks) referenced.add(a.nameKey);
  for (const t of b.traits ?? []) referenced.add(t);
}

/** Desired name per key for keys sourced from an intersecting monster, with the
 *  source entry recorded so a shared-key collision reports both sides. */
const desiredEn = new Map<string, { name: string; source: string }>();
const desiredIt = new Map<string, { name: string; source: string }>();
const collisions: string[] = [];

const monLeaf = (cat: Catalogue, key: string, ctx: string): Leaf => {
  const leaf = cat[key];
  if (!leaf) throw new Error(`[sync] ${ctx}: missing monster catalogue key "${key}"`);
  return leaf;
};

const want = (key: string, source: string, en: string, it: string): void => {
  for (const [map, name] of [
    [desiredEn, en],
    [desiredIt, it],
  ] as const) {
    const prior = map.get(key);
    if (prior && prior.name !== name) {
      collisions.push(
        `  ${key}: "${prior.name}" (${prior.source}) vs "${name}" (${source})`
      );
    } else if (!prior) {
      map.set(key, { name, source });
    }
  }
};

for (const b of beasts) {
  const m = monsterById.get(b.id);
  if (!m) continue; // non-intersecting beasts keep their existing catalogue lexemes
  want(b.id, b.id, monLeaf(enMon, b.id, b.id).name, monLeaf(itMon, b.id, b.id).name);
  for (const a of b.attacks) {
    const eid = a.nameKey.slice("attack.".length);
    const key = `${b.id}.actions.${eid}`;
    want(a.nameKey, key, monLeaf(enMon, key, key).name, monLeaf(itMon, key, key).name);
  }
  for (const t of b.traits ?? []) {
    const tid = t.slice("trait.".length);
    const key = `${b.id}.traits.${tid}`;
    want(t, key, monLeaf(enMon, key, key).name, monLeaf(itMon, key, key).name);
  }
}

if (collisions.length > 0) {
  console.error(
    "[sync] IT/EN shared-key collision — two monsters localize a shared entry id " +
      "differently. Adjudicate against the SRD 5.2.1, never a silent pick:\n" +
      collisions.join("\n")
  );
  process.exit(1);
}

// Apply to both catalogues: prune the unreferenced, then insert/unify each key.
for (const cat of [enBeasts, itBeasts]) {
  for (const key of Object.keys(cat)) {
    if (!referenced.has(key)) Reflect.deleteProperty(cat, key);
  }
}
for (const key of referenced) {
  const en = desiredEn.get(key);
  const it = desiredIt.get(key);
  if (en && it) {
    enBeasts[key] = { name: en.name };
    itBeasts[key] = { name: it.name };
  } else if (!enBeasts[key] || !itBeasts[key]) {
    // A key referenced ONLY by a non-intersecting beast must already be catalogued
    // (it was hand-authored); a missing one is a real gap, not a silent insert.
    throw new Error(
      `[sync] referenced key "${key}" has no catalogue entry and no monster source`
    );
  }
}

// ── 3. Emit beasts.ts ──────────────────────────────────────────────────────────
const header = `/**
 * The Beast stat-block catalogue — Polymorph / True Polymorph forms.
 *
 * GENERATED FILE — DO NOT EDIT BY HAND. Regenerated from the SRD 5.2.1 monster
 * corpus by \`node scripts/sync-beast-projection.ts\` (the shared projection rule
 * lives in \`scripts/beast-projection.ts\`; the intersection projection guard pins
 * the two together — D-5, docs/ARCHITECTURE.md). Each beast whose monster is
 * authored is the 2024 projection of that statblock; the rest carry their prior
 * values until their data wave re-derives them.
 *
 * IDs + numbers ONLY (the §7 no-SRD-strings-in-data guard): every localized name
 * (the Beast, each attack, each trait) lives in \`src/i18n/{en,it}/srd/beasts.json\`
 * keyed by the id here (\`brown-bear\`, \`attack.bite\`, \`trait.pack-tactics\`).
 * Attacks are SELF-CONTAINED (\`toHit\` + \`damageDice\` as printed); a form REPLACES
 * your statistics, so the render edge shows them verbatim, never owner-scaled.
 */
import type { BeastStatBlock } from "@/data/types";

export const BEASTS: ReadonlyArray<BeastStatBlock> = [
`;

const body = beasts
  .map((b) => {
    const name = enBeasts[b.id]?.name ?? b.id;
    return `  // ${name} (2024 SRD 5.2.1). AC ${b.ac}, HP ${b.hp}, CR ${formatCr(b.cr)}.\n  ${JSON.stringify(b)},`;
  })
  .join("\n");

writeFileSync(BEASTS_TS, `${header}${body}\n];\n`);
writeFileSync(EN_JSON, `${JSON.stringify(enBeasts, null, 2)}\n`);
writeFileSync(IT_JSON, `${JSON.stringify(itBeasts, null, 2)}\n`);

// ── 4. Format the generated artefacts ──────────────────────────────────────────
execFileSync("pnpm", ["exec", "prettier", "--write", BEASTS_TS, EN_JSON, IT_JSON], {
  cwd: ROOT,
  stdio: "inherit",
});

const intersecting = beasts.filter((b) => monsterById.has(b.id)).map((b) => b.id);
console.log(
  `[sync] regenerated ${beasts.length} beasts (${intersecting.length} projected: ${intersecting.join(", ")}).`
);
