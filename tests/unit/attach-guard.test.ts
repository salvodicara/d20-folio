/**
 * attach-guard — the pure D9 (one-campaign-per-character) gate behind the race-safe
 * attach transaction (B07). Pins the decision the transaction evaluates on the FRESH
 * character-doc read, so a character already claimed by a DIFFERENT campaign is refused
 * while an unclaimed hero or a same-campaign re-attach is allowed.
 */
import { describe, it, expect } from "vitest";
import { attachViolatesOneCampaign } from "@/features/campaigns/attach-guard";

describe("attachViolatesOneCampaign", () => {
  it("allows attaching an UNCLAIMED character (no prior campaign)", () => {
    // A fresh hero (no field) and a detached-everywhere hero (undefined/null) both pass.
    expect(attachViolatesOneCampaign(undefined, "campA")).toBe(false);
    expect(attachViolatesOneCampaign(null, "campA")).toBe(false);
  });

  it("allows a re-attach to the SAME campaign (idempotent)", () => {
    expect(attachViolatesOneCampaign("campA", "campA")).toBe(false);
  });

  it("REFUSES a character already claimed by a DIFFERENT campaign (D9)", () => {
    // The race outcome: the second device's txn re-reads the now-claimed doc → true → abort.
    expect(attachViolatesOneCampaign("campA", "campB")).toBe(true);
  });
});
