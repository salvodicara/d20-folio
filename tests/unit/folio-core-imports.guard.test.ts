/// <reference types="node" />
/**
 * Guard: the published rules core (`packages/folio-core`) is the engine alone. Every
 * module its entry reaches through value imports stays out of the UI and app layers
 * (`features`, `domains`, `app`, `components`, `hooks`, `ui`, `stores`) and away from
 * React, state stores, Firebase and the i18n runtime. `@pack` is not followed: the core
 * build (`packages/folio-core/vite.config.ts`) points every `@pack` import at the typed
 * empty stub, so the private pack never ships in it. A failure names the import chain that
 * brought the module in; to clear it, move the shared code down into `src/lib`.
 */
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  eagerModules,
  REPO_ROOT,
  staticSpecifiers,
} from "./__helpers__/static-import-graph";

const ENTRY = "packages/folio-core/index.ts";
const FORBIDDEN_DIRS = [
  "src/features/",
  "src/domains/",
  "src/app/",
  "src/components/",
  "src/hooks/",
  "src/ui/",
  "src/stores/",
];
const FORBIDDEN_PACKAGES =
  /^(react|react-dom|react-router|zustand|firebase|firebase-admin|i18next|react-i18next)(\/|$)/;

// The test graph resolves `@pack` to the composed pack; the core build never does.
const closure = new Map(
  [...eagerModules(ENTRY)].filter(([file]) => !file.startsWith("content-pack/"))
);

describe("folio-core imports only the engine", () => {
  it("reaches no UI, app or store module", () => {
    const leaks = [...closure]
      .filter(([file]) => FORBIDDEN_DIRS.some((dir) => file.startsWith(dir)))
      .map(([, chain]) => chain.join(" → "));
    expect(leaks).toEqual([]);
  });

  it("imports no React, store, Firebase or i18n runtime package", () => {
    const leaks = [...closure].flatMap(([file, chain]) =>
      staticSpecifiers(join(REPO_ROOT, file))
        .filter((spec) => FORBIDDEN_PACKAGES.test(spec))
        .map((spec) => `${chain.join(" → ")} → ${spec}`)
    );
    expect(leaks).toEqual([]);
  });
});
