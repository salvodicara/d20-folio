/**
 * emit-pack — write the private content pack as the runtime files the production
 * build downloads (docs/ARCHITECTURE.md → "The content-pack seam").
 *
 *   node --import ./scripts/alias-loader.mjs scripts/pack/emit-pack.ts <outDir> <bucket>
 *
 * Output (uploaded by `upload-pack.ts`, then the app is built with
 * `VITE_CONTENT_PACK=runtime VITE_PACK_VERSION=<version>`):
 *   <outDir>/version.txt                       the pack version (content hash)
 *   <outDir>/content-pack/<version>/*.json     readable only with the `pack` claim
 *   <outDir>/content-pack/art/<kind>/*.webp    served by unguessable token URLs
 *   <outDir>/art-tokens.json                   object path → download token
 *
 * Portraits are `<img>` sources, which cannot send an auth header, so each one is
 * read through a Storage download token: the SHA-256 of its bytes. Only the
 * protected `core.json` lists those URLs.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPackFiles, type PackFiles } from "@/data/pack-wire";
import { collectPackSource } from "./collect-pack-source.ts";
import { contentPackEnabled } from "../content-pack-mode.ts";

export interface EmittedPack extends PackFiles {
  artTokens: Record<string, string>;
}

function storageUrl(bucket: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

/** The local file behind a composed-mode art URL (a `file:` URL or a path). */
function artFile(url: string): string {
  return url.startsWith("file:") ? fileURLToPath(url) : url;
}

export async function emitPack(outDir: string, bucket: string): Promise<EmittedPack> {
  if (!contentPackEnabled()) {
    throw new Error("emit-pack: the content pack is not composed (link content-pack/).");
  }
  const source = await collectPackSource();
  const artTokens: Record<string, string> = {};

  const placeArt = (kind: string, art: Readonly<Record<string, string>>) =>
    Object.fromEntries(
      Object.entries(art).map(([id, url]) => {
        const bytes = readFileSync(artFile(url));
        const token = createHash("sha256").update(bytes).digest("hex");
        const name = `${id.replace(/[^a-z0-9:-]/gi, "_").replace(/:/g, "--")}-${token.slice(0, 8)}.webp`;
        const objectPath = `content-pack/art/${kind}/${name}`;
        mkdirSync(path.join(outDir, path.dirname(objectPath)), { recursive: true });
        writeFileSync(path.join(outDir, objectPath), bytes);
        artTokens[objectPath] = token;
        return [id, storageUrl(bucket, objectPath, token)];
      })
    );

  const pack = buildPackFiles({
    ...source,
    exports: {
      ...source.exports,
      packMonsterArt: placeArt("monsters", source.exports.packMonsterArt),
      packItemArt: placeArt("items", source.exports.packItemArt),
    },
  });

  const folder = path.join(outDir, "content-pack", pack.version);
  mkdirSync(folder, { recursive: true });
  for (const [name, text] of Object.entries(pack.files)) {
    writeFileSync(path.join(folder, name), text);
  }
  writeFileSync(path.join(outDir, "version.txt"), `${pack.version}\n`);
  writeFileSync(path.join(outDir, "art-tokens.json"), JSON.stringify(artTokens, null, 2));
  return { ...pack, artTokens };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [outDir, bucket] = process.argv.slice(2);
  if (!outDir || !bucket) {
    console.error("usage: emit-pack.ts <outDir> <bucket>");
    process.exit(1);
  }
  const pack = await emitPack(outDir, bucket);
  console.log(
    `pack ${pack.version}: ${Object.keys(pack.files).length} files, ${Object.keys(pack.artTokens).length} portraits → ${outDir}`
  );
}
