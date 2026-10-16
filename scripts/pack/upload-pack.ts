/**
 * upload-pack — put an emitted pack (`emit-pack.ts`) into Firebase Storage.
 *
 *   node scripts/pack/upload-pack.ts <emittedPackDir> <bucket> [--apply]
 *
 * Dry run by default: it lists what it would upload. Every object path is
 * immutable (versioned JSON, content-hashed portraits), so existing objects are
 * skipped and a re-run is safe. Portraits get their download token; the JSON
 * gets none, so it is readable only through the `pack`-claim Storage rule.
 *
 * Credentials come from GOOGLE_APPLICATION_CREDENTIALS (the deploy's service
 * account), or the Storage emulator when FIREBASE_STORAGE_EMULATOR_HOST is set.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : [full];
  });
}

export async function uploadPack(packDir: string, bucketName: string, apply: boolean) {
  const artTokens = JSON.parse(
    readFileSync(path.join(packDir, "art-tokens.json"), "utf8")
  ) as Record<string, string>;
  const app = initializeApp({ storageBucket: bucketName }, `upload-pack-${Date.now()}`);
  const bucket = getStorage(app).bucket();
  const local = files(path.join(packDir, "content-pack"));
  const plan = { uploaded: [] as string[], skipped: [] as string[] };

  for (const file of local) {
    const objectPath = path.relative(packDir, file).split(path.sep).join("/");
    const [exists] = await bucket.file(objectPath).exists();
    if (exists) {
      plan.skipped.push(objectPath);
      continue;
    }
    plan.uploaded.push(objectPath);
    if (!apply) continue;
    const token = artTokens[objectPath];
    await bucket.file(objectPath).save(readFileSync(file), {
      resumable: false,
      contentType: objectPath.endsWith(".json") ? "application/json" : "image/webp",
      metadata: {
        cacheControl: "private, max-age=31536000, immutable",
        ...(token ? { metadata: { firebaseStorageDownloadTokens: token } } : {}),
      },
    });
  }
  return plan;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [packDir, bucket] = process.argv.slice(2);
  const apply = process.argv.includes("--apply");
  if (!packDir || !bucket) {
    console.error("usage: upload-pack.ts <emittedPackDir> <bucket> [--apply]");
    process.exit(1);
  }
  const plan = await uploadPack(packDir, bucket, apply);
  console.log(
    `${apply ? "uploaded" : "would upload"} ${plan.uploaded.length} objects, ${plan.skipped.length} already there`
  );
  for (const object of plan.uploaded.filter((o) => o.endsWith(".json")))
    console.log(`  ${object}`);
}
