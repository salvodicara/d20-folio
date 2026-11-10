/**
 * The campaign's effects out of a fight (`campaigns/{id}/effects`), read live for the
 * sheets in a campaign: only with the v0.26.0 rules, and only for the campaign asked.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("@/lib/firebase", () => ({ db: {} }));
const { subscribeCampaignEffects } = vi.hoisted(() => ({
  subscribeCampaignEffects: vi.fn(
    (...[, onDocs]: [string, (docs: unknown[]) => void, unknown]) => {
      onDocs([{ id: "e1" }]);
      return () => undefined;
    }
  ),
}));
vi.mock("@/features/campaigns/campaign-effects-io", () => ({ subscribeCampaignEffects }));

import { useCampaignEffectDocs } from "@/features/campaigns/effects-on-party";

afterEach(() => {
  vi.unstubAllEnvs();
  subscribeCampaignEffects.mockClear();
});

describe("useCampaignEffectDocs", () => {
  it("reads the campaign's effects on the v0.26.0 rules", () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    const { result } = renderHook(() => useCampaignEffectDocs("camp-1"));
    expect(subscribeCampaignEffects).toHaveBeenCalledWith(
      "camp-1",
      expect.any(Function),
      expect.any(Function)
    );
    expect(result.current).toEqual([{ id: "e1" }]);
  });

  it("reads nothing without them, or with no campaign", () => {
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "");
    expect(renderHook(() => useCampaignEffectDocs("camp-1")).result.current).toEqual([]);
    vi.stubEnv("VITE_COMBAT_EFFECTS_V26", "true");
    expect(renderHook(() => useCampaignEffectDocs(null)).result.current).toEqual([]);
    expect(subscribeCampaignEffects).not.toHaveBeenCalled();
  });
});
