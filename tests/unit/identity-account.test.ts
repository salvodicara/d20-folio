import { describe, expect, it } from "vitest";
import { parseAccount } from "@/lib/identity/model";

describe("personal account preferences", () => {
  it("reads an existing account with digital dice as its starting preference", () => {
    expect(parseAccount({ schema: 1, displayName: "Marco", locale: "it" }).diceMode).toBe(
      "digital"
    );
  });
  it("retains physical dice independently of profile language", () => {
    expect(
      parseAccount({
        schema: 1,
        displayName: "Marco",
        locale: "en",
        diceMode: "physical",
      })
    ).toEqual({ schema: 1, displayName: "Marco", locale: "en", diceMode: "physical" });
  });
  it("rejects malformed preferences and unknown account properties", () => {
    for (const delta of [{ diceMode: "random" }, { diceMode: null }, { role: "admin" }]) {
      expect(() =>
        parseAccount({ schema: 1, displayName: "Marco", locale: "it", ...delta })
      ).toThrow("invalid-account");
    }
  });
});
