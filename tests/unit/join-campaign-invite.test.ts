/**
 * `inviteCodeFromInput` — the paste-link-or-code normalizer (de-dup pass).
 *
 * The join field accepts the whole invite LINK (`…/join/<CODE>`) or a bare code;
 * this pure helper extracts + uppercases the code so the user does the least work.
 * A thin pure-function test (smart-test rule) — the render wiring is covered in
 * campaigns-list.test.tsx.
 */

import { describe, expect, it } from "vitest";
import {
  inviteCodeFromInput,
  inviteLinkFromCode,
} from "@/features/campaigns/invite-code";

describe("inviteLinkFromCode", () => {
  it("builds the shareable /join/<code> link from the campaign code", () => {
    // This suite runs in the node env (no `window`), so the origin is empty — the
    // path segment is what matters and is identical client-side.
    expect(inviteLinkFromCode("ABC123")).toMatch(/\/join\/ABC123$/);
  });

  it("round-trips with the inverse parser (link → code)", () => {
    expect(inviteCodeFromInput(inviteLinkFromCode("ROUNDTRIP1"))).toBe("ROUNDTRIP1");
  });
});

describe("inviteCodeFromInput", () => {
  it("extracts the code from a full invite link", () => {
    expect(inviteCodeFromInput("https://d20-folio.web.app/join/JOINME12")).toBe(
      "JOINME12"
    );
  });

  it("tolerates a trailing slash, query, and hash on the link", () => {
    expect(inviteCodeFromInput("https://x/join/ABC123/")).toBe("ABC123");
    expect(inviteCodeFromInput("https://x/join/ABC123?ref=dm")).toBe("ABC123");
    expect(inviteCodeFromInput("https://x/join/ABC123#top")).toBe("ABC123");
  });

  it("uppercases and trims a bare lowercase code", () => {
    expect(inviteCodeFromInput("  abcdef234567 ")).toBe("ABCDEF234567");
  });

  it("returns empty string for empty / whitespace input", () => {
    expect(inviteCodeFromInput("   ")).toBe("");
  });
});
