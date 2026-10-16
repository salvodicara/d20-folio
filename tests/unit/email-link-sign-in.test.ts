/**
 * Passwordless sign-in by email link (`src/features/account/email-link-sign-in.ts`),
 * the second way in next to Google (Phase 5). The flow is Firebase's: send a link,
 * remember the address on this device, finish when the player comes back through
 * it; on another device they type the address again.
 */
import { describe, expect, it, vi } from "vitest";
import {
  createEmailLinkSignIn,
  type EmailLinkDeps,
} from "@/features/account/email-link-sign-in";

function deps(overrides: Partial<EmailLinkDeps> = {}) {
  const stored = new Map<string, string>();
  const base: EmailLinkDeps = {
    origin: "https://d20-folio.web.app",
    send: vi.fn(() => Promise.resolve()),
    isSignInLink: vi.fn((href: string) => href.includes("oobCode=")),
    complete: vi.fn(() => Promise.resolve()),
    storage: {
      get: (key) => stored.get(key) ?? null,
      set: (key, value) => void stored.set(key, value),
      remove: (key) => void stored.delete(key),
    },
  };
  return { ...base, ...overrides, stored };
}

const LINK = "https://d20-folio.web.app/login?apiKey=k&oobCode=abc&mode=signIn";

describe("email-link sign-in", () => {
  it("sends the link back to the login page and remembers the address on this device", async () => {
    const d = deps();
    expect(await createEmailLinkSignIn(d).sendLink("  Lyra@Example.com ")).toBe("sent");
    expect(d.send).toHaveBeenCalledWith("lyra@example.com", {
      url: "https://d20-folio.web.app/login",
      handleCodeInApp: true,
    });
    expect([...d.stored.values()]).toEqual(["lyra@example.com"]);
  });

  it("refuses an address that is not one, without sending", async () => {
    const d = deps();
    expect(await createEmailLinkSignIn(d).sendLink("lyra@")).toBe("invalid-email");
    expect(d.send).not.toHaveBeenCalled();
  });

  it("finishes on the same device with the remembered address, then forgets it", async () => {
    const d = deps();
    const flow = createEmailLinkSignIn(d);
    await flow.sendLink("lyra@example.com");
    expect(await flow.completeFromUrl(LINK)).toBe("signed-in");
    expect(d.complete).toHaveBeenCalledWith("lyra@example.com", LINK);
    expect(d.stored.size).toBe(0);
  });

  it("on another device asks for the address, then finishes with the typed one", async () => {
    const d = deps();
    const flow = createEmailLinkSignIn(d);
    expect(await flow.completeFromUrl(LINK)).toBe("needs-email");
    expect(d.complete).not.toHaveBeenCalled();
    expect(await flow.completeFromUrl(LINK, "Lyra@example.com")).toBe("signed-in");
    expect(d.complete).toHaveBeenCalledWith("lyra@example.com", LINK);
  });

  it("ignores a page that is not a sign-in link", async () => {
    const d = deps();
    expect(
      await createEmailLinkSignIn(d).completeFromUrl("https://d20-folio.web.app/login")
    ).toBe("not-a-link");
  });

  it("names an expired or used link, so the player can ask for a new one", async () => {
    const d = deps({
      complete: vi.fn(() =>
        Promise.reject(
          Object.assign(new Error("x"), { code: "auth/expired-action-code" })
        )
      ),
    });
    d.stored.set("folio.emailForSignIn", "lyra@example.com");
    expect(await createEmailLinkSignIn(d).completeFromUrl(LINK)).toBe("invalid-link");
  });

  it("names a link opened with a different address", async () => {
    const d = deps({
      complete: vi.fn(() =>
        Promise.reject(Object.assign(new Error("x"), { code: "auth/invalid-email" }))
      ),
    });
    expect(
      await createEmailLinkSignIn(d).completeFromUrl(LINK, "other@example.com")
    ).toBe("wrong-email");
  });

  it("reports a failed send instead of claiming it went", async () => {
    const d = deps({ send: vi.fn(() => Promise.reject(new Error("network"))) });
    expect(await createEmailLinkSignIn(d).sendLink("lyra@example.com")).toBe(
      "send-failed"
    );
    expect(d.stored.size).toBe(0);
  });
});
