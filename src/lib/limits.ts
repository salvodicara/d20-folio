/**
 * Free-tier resource caps (#29).
 *
 * The project runs on Firebase's free (Spark/Blaze-in-free-tier) budget, so every
 * user-owned collection must be BOUNDED — both to keep reads/writes/storage within
 * the free quota and to keep the UI snappy. These are the single source of truth for
 * the caps; the client guards create flows against them (disable + explain) and the
 * snapshot writer auto-prunes oldest-first, and `firestore.rules` mirrors them so a
 * cap can't be bypassed by a direct write.
 *
 * Pure constants — no Firebase import — so any layer (UI, lib, tests) can read them.
 */
export const FREE_TIER_LIMITS = {
  /** Max characters a single user can own. */
  characters: 20,
  /** Max campaigns a single user can own (be DM of). */
  campaigns: 5,
  /** Max version snapshots kept PER character (oldest auto-pruned beyond this).
   *  Snapshots auto-generate on every level-up, so this list is the one that grows
   *  unattended — it must self-bound. */
  snapshotsPerCharacter: 50,
} as const;
