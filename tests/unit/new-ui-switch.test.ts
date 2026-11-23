// @vitest-environment jsdom
/**
 * Saving «Try the new interface» (#1233). The choice is written to the player's own user
 * document; only once the server accepts it does the page reload into the chosen
 * interface, with any `?ui=` override dropped. Offline there is no write at all (a queued
 * write would leave the toggle spinning, or be undone on reload), and a refused write
 * keeps the page as it is: the player is told, nothing reloads.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  updateDoc: vi.fn<(ref: unknown, data: unknown) => Promise<void>>(),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path: path.join("/") }),
  updateDoc: h.updateDoc,
}));

import { saveNewUi, withoutUiOverride } from "@/features/account/new-ui-switch";

let online = true;
const reload = vi.fn<(href: string) => void>();

beforeEach(() => {
  online = true;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
  h.updateDoc.mockReset();
  h.updateDoc.mockResolvedValue(undefined);
  reload.mockReset();
});

describe("saveNewUi", () => {
  it("writes only the player's own opt-in, then reloads into it", async () => {
    await expect(saveNewUi("u1", true, reload)).resolves.toBe("saved");
    expect(h.updateDoc).toHaveBeenCalledWith({ path: "users/u1" }, { newUi: true });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("offline, nothing is written and nothing reloads", async () => {
    online = false;
    await expect(saveNewUi("u1", true, reload)).resolves.toBe("offline");
    expect(h.updateDoc).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("a refused write keeps the page as it is", async () => {
    h.updateDoc.mockRejectedValue(new Error("permission-denied"));
    await expect(saveNewUi("u1", false, reload)).resolves.toBe("failed");
    expect(reload).not.toHaveBeenCalled();
  });
});

describe("withoutUiOverride: the address the page reloads to", () => {
  it("drops ?ui= and keeps everything else", () => {
    expect(withoutUiOverride("https://x.test/settings?ui=classic")).toBe(
      "https://x.test/settings"
    );
    expect(withoutUiOverride("https://x.test/c/1?tab=play&ui=new#hp")).toBe(
      "https://x.test/c/1?tab=play#hp"
    );
    expect(withoutUiOverride("https://x.test/settings")).toBe("https://x.test/settings");
  });
});
