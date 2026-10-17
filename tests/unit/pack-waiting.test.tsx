/**
 * The pack-waiting notice can show before i18n exists, so it reads its words from
 * the boot catalogue shards directly. Pinned: the sentence it showed before.
 */
import { afterEach, describe, expect, it } from "vitest";
import { showPackWaiting } from "@/platform/pack-waiting";

describe("the pack-waiting notice", () => {
  afterEach(() => {
    showPackWaiting(false);
    localStorage.removeItem("i18nextLng");
  });

  it("speaks the stored language before i18n exists", () => {
    localStorage.setItem("i18nextLng", "it");
    showPackWaiting(true);
    expect(document.getElementById("folio-pack-waiting")?.textContent).toBe(
      "Contenuti in caricamento… Folio continua a riprovare finché non arrivano."
    );
  });

  it("falls back to English for a language Folio does not speak", () => {
    localStorage.setItem("i18nextLng", "de");
    showPackWaiting(true);
    expect(document.getElementById("folio-pack-waiting")?.textContent).toBe(
      "Loading your content… Folio will keep trying until it arrives."
    );
  });
});
