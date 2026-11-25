// @vitest-environment jsdom
/**
 * «Try the new interface» (#1233): which interface a page load shows. The choice is the
 * player's stored opt-in, read with the profile (which the protected screens wait for
 * anyway), so nothing is cached on the device and no automatic reload can loop. Two
 * overrides sit above it: the `VITE_NEW_UI=1` build (the preview server and the
 * rehearsal) forces the new interface, and `?ui=classic` / `?ui=new` decides for one page
 * load with no write and no storage. `?ui=classic` beats both: it is the way back when
 * the new interface cannot render.
 */
import { describe, expect, it, vi } from "vitest";

import {
  chooseNewUi,
  classicHref,
  honouredOverride,
  uiOverride,
} from "@/app/new-ui-choice";

describe("uiOverride: the one-page-load choice in the address", () => {
  it("reads ?ui=classic and ?ui=new", () => {
    expect(uiOverride("?ui=classic")).toBe("classic");
    expect(uiOverride("?ui=new")).toBe("new");
    expect(uiOverride("?tab=play&ui=new")).toBe("new");
  });

  it("ignores anything else", () => {
    expect(uiOverride("")).toBeNull();
    expect(uiOverride("?ui=NEW")).toBeNull();
    expect(uiOverride("?ui=")).toBeNull();
    expect(uiOverride("?view=new")).toBeNull();
  });
});

describe("classicHref: the way back from a broken new screen", () => {
  it("is the same page with ?ui=classic, keeping the rest of the address", () => {
    expect(classicHref("https://x.test/characters/c1?tab=play#hp")).toBe(
      "https://x.test/characters/c1?tab=play&ui=classic#hp"
    );
    expect(uiOverride(new URL(classicHref("https://x.test/c?ui=new")).search)).toBe(
      "classic"
    );
  });
});

describe("honouredOverride: what a build accepts from the address", () => {
  it("?ui=classic everywhere, ?ui=new only in development", () => {
    expect(honouredOverride("classic", false)).toBe("classic");
    expect(honouredOverride("new", false)).toBeNull();
    expect(honouredOverride("new", true)).toBe("new");
    expect(honouredOverride(null, true)).toBeNull();
  });
});

describe("chooseNewUi", () => {
  const base = { forced: false, override: null, optedIn: undefined } as const;

  it("is classic by default, and for a signed-out visitor", () => {
    expect(chooseNewUi(base)).toBe(false);
  });

  it("follows the player's stored opt-in, and only a literal true", () => {
    expect(chooseNewUi({ ...base, optedIn: true })).toBe(true);
    expect(chooseNewUi({ ...base, optedIn: false })).toBe(false);
  });

  it("the address override wins over the opt-in, both ways", () => {
    expect(chooseNewUi({ ...base, optedIn: true, override: "classic" })).toBe(false);
    expect(chooseNewUi({ ...base, optedIn: false, override: "new" })).toBe(true);
  });

  it("the VITE_NEW_UI build forces the new interface over the opt-in", () => {
    expect(chooseNewUi({ forced: true, override: null, optedIn: false })).toBe(true);
  });

  it("?ui=classic is always the way back, even on the VITE_NEW_UI build", () => {
    expect(chooseNewUi({ forced: true, override: "classic", optedIn: true })).toBe(false);
  });
});

vi.mock("@/lib/firebase", () => ({ db: {}, auth: {} }));
import { toUserProfile, type FirestoreUserDoc } from "@/lib/auth";

describe("the stored opt-in, as the profile reads it", () => {
  const stored = (newUi?: unknown): FirestoreUserDoc => ({
    uid: "u1",
    email: "",
    displayName: "",
    photoURL: null,
    status: "active",
    createdAt: null,
    lastActiveAt: null,
    settings: null,
    ...(newUi === undefined ? {} : { newUi }),
  });

  it("a document from before the toggle (no field) is classic", () => {
    expect(toUserProfile(stored()).newUi).toBe(false);
  });

  it("only a literal true opts in; any other stored value is classic", () => {
    expect(toUserProfile(stored(true)).newUi).toBe(true);
    for (const value of [false, "true", 1, {}, null]) {
      expect(toUserProfile(stored(value)).newUi).toBe(false);
    }
  });
});
