import { create } from "zustand";
import type { User } from "firebase/auth";

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  status: "active" | "blocked";
  /**
   * Authorization role. Absent (the default for every user) means a normal
   * player; `"admin"` unlocks the admin console + admin-gated affordances. This
   * is the SINGLE source of truth for admin (mirrored server-side by
   * `firestore.rules`' role check).
   * Granted out-of-band (Firestore console / an admin script); never settable by
   * the client (the users `update` rule is admin-only and `create` forbids it).
   */
  role?: "admin";
  createdAt: Date;
  lastActiveAt: Date;
  settings: {
    language: "en" | "it";
    theme: "dark" | "light" | "system";
  };
}

interface AuthState {
  /** Firebase Auth user (null if not signed in) */
  user: User | null;
  /** Firestore user profile (null if not loaded) */
  profile: UserProfile | null;
  /** Whether auth state has been resolved (initial load complete) */
  initialized: boolean;
  /** Whether the user is blocked */
  isBlocked: boolean;
  /** Auth loading state (for sign-in/sign-out operations) */
  loading: boolean;
  /** Auth error message */
  error: string | null;

  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setInitialized: (initialized: boolean) => void;
  setIsBlocked: (blocked: boolean) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  profile: null,
  initialized: false,
  isBlocked: false,
  loading: false,
  error: null,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setInitialized: (initialized) => set({ initialized }),
  setIsBlocked: (blocked) => set({ isBlocked: blocked }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      user: null,
      profile: null,
      isBlocked: false,
      loading: false,
      error: null,
    }),
}));
