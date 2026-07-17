import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { useAuthStore, type UserProfile } from "@/stores/authStore";
import { DEV_BYPASS_AUTH, DEV_BYPASS_PHOTO_URL } from "@/lib/dev-bypass";
// DEV-ONLY (remove before release): act-as-member impersonation (the `?devActAs=<uid>`
// emulator sandbox; see `dev-impersonate.ts` + `content-pack/scripts/dev-seed-sandbox.ts`).
import { devActAsUid } from "@/lib/dev-impersonate";

const googleProvider = new GoogleAuthProvider();

/**
 * Sign in with Google popup.
 * Creates a user document in Firestore on first sign-in.
 */
export async function signIn(): Promise<void> {
  const store = useAuthStore.getState();
  store.setLoading(true);
  store.setError(null);

  try {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserDocument(result.user);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sign-in failed";
    // The store IS the error channel (the login page renders it with a retry);
    // re-throwing only produced an unhandled rejection on every cancelled popup.
    store.setError(message);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Sign out the current user.
 */
export async function signOut(): Promise<void> {
  const store = useAuthStore.getState();
  store.setLoading(true);

  try {
    await firebaseSignOut(auth);
    store.reset();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Sign-out failed";
    store.setError(message);
  } finally {
    store.setLoading(false);
  }
}

/**
 * Create user document in Firestore if it doesn't already exist.
 * Called after successful sign-in.
 *
 * A15/A16 — only the FIRST-TIME setDoc is awaited (we genuinely need the
 * doc to exist so security rules and the profile-fetch downstream can find
 * it). The recurring `lastActiveAt` write for existing users is telemetry-
 * grade and must NOT block sign-in: a network blip or transient permission
 * error on that write previously caused the entire sign-in to throw even
 * though Firebase Auth had already succeeded. It now fires non-blocking and
 * errors only log; auth success no longer depends on telemetry.
 */
async function ensureUserDocument(user: User): Promise<void> {
  const userRef = doc(db, "users", user.uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    // First-time sign-in — create user document
    const newUser: Omit<UserProfile, "createdAt" | "lastActiveAt"> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      lastActiveAt: ReturnType<typeof serverTimestamp>;
    } = {
      uid: user.uid,
      email: user.email ?? "",
      displayName: user.displayName ?? "",
      photoURL: user.photoURL,
      status: "active",
      createdAt: serverTimestamp(),
      lastActiveAt: serverTimestamp(),
      settings: {
        language: navigator.language.startsWith("it") ? "it" : "en",
        theme: "dark",
      },
    };

    await setDoc(userRef, newUser);
  } else {
    // Existing user — fire-and-forget the lastActiveAt bump so a transient
    // Firestore error never blocks sign-in. Logged for diagnostics; not
    // propagated. (A15/A16 — decouples telemetry from auth success.)
    void updateDoc(userRef, { lastActiveAt: serverTimestamp() }).catch((err: unknown) => {
      console.warn("[auth] lastActiveAt update failed (non-fatal):", err);
    });
  }
}

/**
 * Fetch user profile from Firestore and update the auth store.
 * Returns null if user document doesn't exist.
 */
/** Firestore user document shape (for type-safe access) */
interface FirestoreUserDoc {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  status: "active" | "blocked";
  // Authorization role — absent for normal players, "admin" for the admin gate.
  // Set out-of-band (console / admin script); the client never writes it.
  role?: "admin";
  createdAt: { toDate: () => Date } | null;
  lastActiveAt: { toDate: () => Date } | null;
  settings: {
    language: "en" | "it";
    theme: "dark" | "light" | "system";
  } | null;
}

async function fetchUserProfile(uid: string): Promise<UserProfile | null> {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return null;
  }

  const data = userSnap.data() as FirestoreUserDoc;
  const profile: UserProfile = {
    uid: data.uid,
    email: data.email,
    displayName: data.displayName,
    photoURL: data.photoURL,
    status: data.status,
    // Only surface the admin role; any other/absent value is a normal player.
    role: data.role === "admin" ? "admin" : undefined,
    createdAt: data.createdAt?.toDate() ?? new Date(),
    lastActiveAt: data.lastActiveAt?.toDate() ?? new Date(),
    settings: {
      language: data.settings?.language ?? "en",
      theme: data.settings?.theme ?? "dark",
    },
  };

  return profile;
}

/**
 * Initialize auth state listener.
 * Call this once at app startup.
 * Listens to Firebase Auth state changes and syncs with Zustand store.
 */
export function initAuthListener(): () => void {
  // In dev bypass mode, set a mock user immediately and skip Firebase. The same
  // `?devActAs=<uid>` param the emulator sandbox honors works here too, presenting
  // the store AS that campaign-member uid (e.g. `member-mara`) so the bypass hub can
  // be viewed from a PLAYER's perspective, not only the fixture DM's. Dev-only —
  // this whole branch is tree-shaken from production.
  if (DEV_BYPASS_AUTH) {
    const store = useAuthStore.getState();
    const bypassUid = devActAsUid() ?? "mock-uid";
    store.setUser({
      uid: bypassUid,
      email: "mock@test.dev",
      photoURL: DEV_BYPASS_PHOTO_URL,
    } as User);
    // A real profile too (production always has one after first sign-in), so
    // profile-driven chrome (the topbar display name) renders in bypass. The
    // name is overridable via localStorage so the shot harness can exercise
    // short/long names. Dev-only: this whole branch is tree-shaken from prod.
    const devName = window.localStorage.getItem("dev-bypass-name") ?? "Dev Adventurer";
    store.setProfile({
      uid: bypassUid,
      email: "mock@test.dev",
      displayName: devName,
      photoURL: DEV_BYPASS_PHOTO_URL,
      status: "active",
      createdAt: new Date(0),
      lastActiveAt: new Date(0),
      settings: { language: "en", theme: "dark" },
    });
    store.setInitialized(true);
    return () => {};
  }

  const unsubscribe = onAuthStateChanged(auth, (user) => {
    const store = useAuthStore.getState();

    if (user) {
      // DEV-ONLY (remove before release): act-as-member impersonation. When
      // `?devActAs=<uid>` is set in a DEV build, present the auth store AS that member
      // while the REAL token (`auth.currentUser`) stays the signed-in owner/admin — so
      // every cross-member read/write is authorized server-side via the rules'
      // `isAdmin()` branch. `role: undefined` is exactly right: a player uid →
      // `useIsAdmin = false` + `dmUid !== uid` → the player view; the DM uid →
      // `isDm = dmUid === uid` → the DM view. Skip the real profile fetch. The whole
      // branch folds away in prod (`import.meta.env.DEV` is statically `false`).
      if (import.meta.env.DEV) {
        const actAs = devActAsUid();
        if (actAs && actAs !== user.uid) {
          store.setUser({ ...user, uid: actAs });
          store.setProfile({
            uid: actAs,
            email: user.email ?? "",
            displayName: user.displayName ?? "",
            photoURL: user.photoURL,
            status: "active",
            role: undefined,
            createdAt: new Date(0),
            lastActiveAt: new Date(0),
            settings: { language: "en", theme: "dark" },
          });
          store.setInitialized(true);
          return;
        }
      }

      store.setUser(user);

      void fetchUserProfile(user.uid)
        .then((profile) => {
          if (profile) {
            store.setProfile(profile);
            store.setIsBlocked(profile.status === "blocked");
          }
          store.setInitialized(true);
        })
        .catch((error: unknown) => {
          console.error("Failed to fetch user profile:", error);
          store.setError("Failed to load user profile");
          store.setInitialized(true);
        });
    } else {
      store.reset();
      store.setInitialized(true);
    }
  });

  return unsubscribe;
}
