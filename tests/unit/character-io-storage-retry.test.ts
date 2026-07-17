/**
 * Pins the single-flight retry in `buildCharacterExport`'s lazy Storage-SDK
 * import: a REJECTED import must never be memoized — the export that hit the
 * transient chunk-load failure rejects (loud, the caller can warn), and the
 * NEXT export retries the import and succeeds. Without the retry, one flaky
 * network moment would poison every later export until a page reload.
 *
 * Own file (not `character-io-zip.test.ts`): this needs a DIFFERENT module-mock
 * harness — a factory that fails its first evaluation — which would corrupt
 * that suite's always-succeeding mock.
 */
import { describe, expect, it, vi } from "vitest";
import { assertNonEmptyString } from "@/lib/non-empty-string";
import type { CharacterDoc } from "@/types/character";
import { MOCK_CHARACTER } from "@/lib/mock";
import { buildCharacterExport } from "@/lib/character-io";

const harness = vi.hoisted(() => ({
  failNext: true,
  portraitToDataUrl: vi.fn(() => Promise.resolve("data:image/png;base64,aGk=")),
}));

// First evaluation rejects (a transient chunk-load failure); later evaluations
// resolve the working mock.
vi.mock("@/lib/storage", () => {
  if (harness.failNext) {
    harness.failNext = false;
    throw new Error("transient chunk-load failure");
  }
  return { portraitToDataUrl: harness.portraitToDataUrl };
});

function doc(): CharacterDoc {
  return {
    ...MOCK_CHARACTER,
    portraitUrl:
      "https://firebasestorage.googleapis.com/v0/b/x/o/p.jpg?alt=media&token=t",
    character: { ...MOCK_CHARACTER.character, name: assertNonEmptyString("Retry") },
  };
}

describe("single-flight Storage import — never caches a rejection", () => {
  it("a failed lazy import rejects that export, and the next export retries and succeeds", async () => {
    // (vitest wraps a throwing mock factory in its own error message, so this
    // asserts the rejection itself — the fact under test — not the exact text.)
    await expect(buildCharacterExport(doc())).rejects.toThrow();
    const exp = await buildCharacterExport(doc());
    expect(harness.portraitToDataUrl).toHaveBeenCalledWith(doc().portraitUrl);
    expect(exp.portraitDropped).toBe(false);
  });
});
