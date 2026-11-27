/**
 * The campaign's effects out of a fight (`campaigns/{id}/effects`), read live for the
 * sheets in a campaign: only for the campaign asked.
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
  subscribeCampaignEffects.mockClear();
});

describe("useCampaignEffectDocs", () => {
  it("reads the campaign's effects", () => {
    const { result } = renderHook(() => useCampaignEffectDocs("camp-1"));
    expect(subscribeCampaignEffects).toHaveBeenCalledWith(
      "camp-1",
      expect.any(Function),
      expect.any(Function)
    );
    expect(result.current).toEqual([{ id: "e1" }]);
  });

  it("reads nothing with no campaign", () => {
    expect(renderHook(() => useCampaignEffectDocs(null)).result.current).toEqual([]);
    expect(subscribeCampaignEffects).not.toHaveBeenCalled();
  });
});
