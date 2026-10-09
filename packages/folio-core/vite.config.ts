/**
 * Library build of @d20-folio/core (`pnpm core:build`). Same sources as the app,
 * SRD-only by construction: every `@pack` alias points at the typed-empty stub, never
 * at the private content pack, whatever the environment says.
 */
import { defineConfig } from "vite";
import path from "node:path";

const here = import.meta.dirname;
const src = path.resolve(here, "../../src");
const packEmpty = path.join(src, "data/pack-empty.ts");

export default defineConfig({
  root: here,
  publicDir: false,
  resolve: {
    alias: [
      { find: /^@pack(\/.*)?$/, replacement: packEmpty },
      { find: "@", replacement: src },
    ],
  },
  build: {
    lib: {
      entry: path.join(here, "index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    outDir: path.join(here, "dist"),
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    sourcemap: false,
    reportCompressedSize: false,
  },
});
