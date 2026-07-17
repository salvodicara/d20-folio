#!/usr/bin/env node
/**
 * set-storage-cors.mjs — apply the CORS configuration to the Firebase Storage bucket.
 *
 * WHY THIS EXISTS (the final layer of the portrait-export saga, 2026-06-10): browser
 * XHR/fetch reads of Storage objects — which is what the Storage SDK's `getBlob()`
 * uses for the JSON export's portrait embed — require a CORS configuration ON THE
 * GCS BUCKET (Firebase docs: "Download files → CORS configuration"). Without it,
 * googleapis returns the bytes (HTTP 200) but NO `Access-Control-Allow-Origin`
 * header, and the browser blocks the read (`net::ERR_FAILED 200 (OK)`). The display
 * `<img>` always worked because img tags are CORS-exempt (no-cors) — which is why
 * the export bug looked haunted across three rounds while portraits rendered fine.
 *
 * A bucket's CORS config is INFRA, not app code — no test exercises the real bucket
 * (CI emulates Storage with permissive headers). It is applied once with this script
 * and verified from outside the SDK with a curl preflight:
 *
 *   curl -s -i -X OPTIONS \
 *     -H "Origin: http://localhost:5173" \
 *     -H "Access-Control-Request-Method: GET" \
 *     "https://firebasestorage.googleapis.com/v0/b/<bucket>/o/whatever?alt=media"
 *
 * → must answer with `Access-Control-Allow-Origin` (preflight needs no auth).
 *
 * USAGE (firebase-admin from the root devDeps, credentials via
 * GOOGLE_APPLICATION_CREDENTIALS, supplied by the owner at run time; this script
 * never knows the key path or contents):
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=<service-account-key.json> \
 *     node scripts/set-storage-cors.mjs [--print]
 *
 *   --print   show the CURRENT bucket CORS config and exit (no write).
 *
 * No app imports — pure JS so it runs with plain `node`.
 */

/** The project's one Storage bucket (new-style domain — see VITE_FIREBASE_STORAGE_BUCKET). */
const BUCKET = "d20-folio.firebasestorage.app";

/**
 * The exact origins that legitimately read portrait bytes in a browser:
 * the two Hosting domains + the Vite dev ports. GET/HEAD only (reads — uploads go
 * through the SDK's resumable channel, which is same-protocol and unaffected).
 */
const CORS_CONFIG = [
  {
    origin: [
      "https://d20-folio.web.app",
      "https://d20-folio.firebaseapp.com",
      "http://localhost:5173",
      "http://localhost:5174",
    ],
    method: ["GET", "HEAD"],
    responseHeader: ["Content-Type"],
    maxAgeSeconds: 3600,
  },
];

async function main() {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      "Set GOOGLE_APPLICATION_CREDENTIALS to a service-account key path first."
    );
    process.exit(1);
  }
  const { initializeApp, applicationDefault } = await import("firebase-admin/app");
  const { getStorage } = await import("firebase-admin/storage");
  initializeApp({ credential: applicationDefault(), storageBucket: BUCKET });
  const bucket = getStorage().bucket();

  const [meta] = await bucket.getMetadata();
  console.log(`bucket: ${BUCKET}`);
  console.log("current CORS config:");
  console.log(JSON.stringify(meta.cors ?? null, null, 2));

  if (process.argv.includes("--print")) return;

  await bucket.setCorsConfiguration(CORS_CONFIG);
  const [after] = await bucket.getMetadata();
  console.log("\nnew CORS config:");
  console.log(JSON.stringify(after.cors ?? null, null, 2));
  console.log("\n✓ CORS configuration applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
