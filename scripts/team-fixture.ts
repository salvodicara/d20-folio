/**
 * A team fixture's file by its neutral role (`bard`). The fixtures and their file
 * names are personal data in the private pack (`content-pack/fixtures/team/`), so the
 * public scripts name each by role and the pack's `team-roles.json` maps it.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { DEV_HERO_NAMES } from "../src/lib/dev-hero-names.ts";

/** The fixture file for `role` under `root`, or null when the pack is absent. */
export function teamFixturePath(root: string, role: string): string | null {
  const manifest = resolvePath(root, "content-pack", "fixtures", "team-roles.json");
  if (!existsSync(manifest)) return null;
  const key = (JSON.parse(readFileSync(manifest, "utf8")) as Record<string, string>)[
    role
  ];
  return key
    ? resolvePath(root, "content-pack", "fixtures", "team", `${key}.json`)
    : null;
}

/** Text in a fixture that can carry a real person's or character's name. */
const PERSONAL_TEXT = ["backstory", "bonds", "flaws", "ideals", "traits"] as const;

export interface SandboxEnvelope {
  build: Record<string, unknown> & { name: string; player?: string };
  state: Record<string, unknown>;
}

/**
 * The team fixture for `role` as the emulator sandbox seeds it (local dev and the CI
 * rehearsal): the made-up name the dev screens use (`DEV_HERO_NAMES`, #1144), no
 * player name, no lore and no quote. The fixtures are real players' characters, and a
 * public CI run's logs, traces and screenshots must never carry their names
 * (coordinator, 2026-11-13). Null when the pack is absent.
 */
export function sandboxEnvelope(root: string, role: string): SandboxEnvelope | null {
  const file = teamFixturePath(root, role);
  const name = DEV_HERO_NAMES[role];
  if (!file || !existsSync(file) || !name) return null;
  const envelope = JSON.parse(readFileSync(file, "utf8")) as SandboxEnvelope;
  const build: SandboxEnvelope["build"] = { ...envelope.build, name, player: "" };
  delete build.quote;
  if (build.lore && typeof build.lore === "object") {
    const lore = { ...(build.lore as Record<string, unknown>) };
    for (const field of PERSONAL_TEXT) if (field in lore) lore[field] = "";
    build.lore = lore;
  }
  return { ...envelope, build };
}

/**
 * The JSON paths (keys only, `*` for an array index) of every string in `value` that
 * holds a term of the pack's `private-terms.json`, in any case. Empty when the pack is
 * absent. The seeds refuse to write a document with a hit.
 */
export function privateTermPaths(value: unknown, root: string): string[] {
  const file = resolvePath(root, "content-pack", "private-terms.json");
  if (!existsSync(file)) return [];
  const terms = (JSON.parse(readFileSync(file, "utf8")) as string[])
    .map((term) => term.toLowerCase())
    .filter((term) => term !== "");
  const hits = new Set<string>();
  const walk = (node: unknown, path: string[]): void => {
    if (typeof node === "string") {
      const text = node.toLowerCase();
      if (terms.some((term) => text.includes(term))) hits.add(path.join("/"));
    } else if (Array.isArray(node)) {
      for (const item of node) walk(item, [...path, "*"]);
    } else if (node && typeof node === "object") {
      for (const [key, item] of Object.entries(node)) walk(item, [...path, key]);
    }
  };
  walk(value, []);
  return [...hits];
}

/** Refuse to seed `documents` that hold a private term (paths only in the message). */
export function assertNoPrivateTerms(documents: unknown, root: string): void {
  const hits = privateTermPaths(documents, root);
  if (hits.length > 0)
    throw new Error(
      `Refusing to seed: a private term in ${hits.slice(0, 5).join(", ")}${
        hits.length > 5 ? ` and ${String(hits.length - 5)} more` : ""
      }`
    );
}
