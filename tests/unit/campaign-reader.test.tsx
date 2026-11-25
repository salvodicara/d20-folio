/**
 * The shell that renders the lazy campaign reader says so from its first frame, so a
 * turn action waits for the reader instead of acting before it exists (#1210). The
 * flag drops when the shell unmounts or stops rendering the reader.
 */
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useCampaignReader } from "@/features/campaigns/campaign-reader";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";

const mounted = () => usePartyRosterStore.getState().readerMounted;

afterEach(() => usePartyRosterStore.setState({ readerMounted: false }));

describe("useCampaignReader", () => {
  it("a shell that renders the reader marks it mounted, and unmounting clears it", () => {
    const { unmount } = renderHook(() => useCampaignReader(true));
    expect(mounted()).toBe(true);
    unmount();
    expect(mounted()).toBe(false);
  });

  it("a shell that does not render the reader yet leaves it unmounted until it does", () => {
    const { rerender } = renderHook(({ renders }) => useCampaignReader(renders), {
      initialProps: { renders: false },
    });
    expect(mounted()).toBe(false);
    rerender({ renders: true });
    expect(mounted()).toBe(true);
    rerender({ renders: false });
    expect(mounted()).toBe(false);
  });
});
