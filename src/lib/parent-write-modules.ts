/**
 * The two modules a character's parent write serializes with (the codec and the cache
 * builder), loaded on demand so they never weigh on the eager bundle.
 *
 * #1275: a build edit must reach the Firestore SDK inside the event that hides the page
 * (a phone lock fires `visibilitychange → hidden`, then the page may be frozen). So the
 * sheet loads these when it opens, and a write made once they are in builds its batch
 * and calls `commit()` with no `await` in between (`loadedParentWriteModules`).
 */
export interface ParentWriteModules {
  codec: typeof import("@/lib/character-codec");
  cacheBuild: typeof import("@/lib/character-cache-build");
}

let loaded: ParentWriteModules | null = null;
let loading: Promise<ParentWriteModules> | null = null;

/** Load the modules once; later calls share the same promise. */
export function preloadParentWrite(): Promise<ParentWriteModules> {
  loading ??= Promise.all([
    import("@/lib/character-codec"),
    import("@/lib/character-cache-build"),
  ]).then(([codec, cacheBuild]) => (loaded = { codec, cacheBuild }));
  return loading;
}

/** The modules if they are already in, else null (the caller then waits for the load). */
export function loadedParentWriteModules(): ParentWriteModules | null {
  return loaded;
}

/** Tests only: forget the load, so the next write takes the cold path. */
export function resetParentWriteForTests(): void {
  loaded = null;
  loading = null;
}
