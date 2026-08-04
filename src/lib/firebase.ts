import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  connectFirestoreEmulator,
} from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
const useEmulators = import.meta.env.VITE_USE_EMULATORS === "true";

export const app = initializeApp(firebaseConfig);

// App Check (pre-GA hardening — docs/BUG_REPORTING.md → "App Check rollout runbook").
// Strictly gated on VITE_APPCHECK_SITE_KEY being set: no key (dev/CI/e2e/forks) =
// zero new network calls. The key is a reCAPTCHA ENTERPRISE score key (the one
// kind provisionable headlessly via gcloud; token TTL 24h keeps the Enterprise
// free tier roomy) — provisioned 2026-08-02, see the rollout runbook.
// Emulator traffic never needs a production reCAPTCHA token. Disabling App Check in
// the sandbox also prevents `.env.local`'s live site key from making any external call.
const appCheckSiteKey = useEmulators ? undefined : import.meta.env.VITE_APPCHECK_SITE_KEY;
if (appCheckSiteKey) {
  if (import.meta.env.VITE_APPCHECK_DEBUG === "true") {
    // Debug-token escape hatch (dev/CI/e2e) — must be set BEFORE initializeAppCheck.
    (self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN =
      true;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);

let db: ReturnType<typeof initializeFirestore>;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  });
} catch (err) {
  // Persistence may fail in incognito mode or unsupported browsers.
  // Fall back to default (memory) cache.
  console.warn("Firestore offline persistence unavailable:", err);
  db = initializeFirestore(app, {});
}
export { db };

export const storage = getStorage(app);

// Callable Cloud Functions live in europe-west1 (matches the deployed region in
// functions/src/index.ts `setGlobalOptions`). Used by the admin `deleteUser` callable.
export const functions = getFunctions(app, "europe-west1");

// Connect to emulators in development
if (useEmulators) {
  connectAuthEmulator(auth, "http://localhost:9099");
  connectFirestoreEmulator(db, "localhost", 8080);
  connectStorageEmulator(storage, "localhost", 9199);
  connectFunctionsEmulator(functions, "localhost", 5001);
}
