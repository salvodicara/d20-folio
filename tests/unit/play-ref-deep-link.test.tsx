/**
 * PlayRefDeepLink — the cockpit consumer of the ⌘K palette's "jump to a Play-tab
 * reference" request. Pins the wiring: a `pendingPlayRef` request switches to the
 * Combat tab (mirrored to `?tab=`), opens the target section (persisted), scrolls
 * its header into view, and clears the request.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import { MemoryRouter, useSearchParams } from "react-router";
import { TabsProvider } from "@/features/character/center/TabsProvider";
import { PlayRefDeepLink } from "@/features/character/center/PlayRefDeepLink";
import { PLAY_REF_ANCHOR } from "@/features/character/center/play-reference";
import { useUIStore } from "@/stores/uiStore";

/** Probe the `?tab=` deep-link mirror the provider writes on a tab switch. */
function TabParam() {
  const [sp] = useSearchParams();
  return <span data-testid="tab">{sp.get("tab") ?? ""}</span>;
}

function setup() {
  return render(
    <MemoryRouter initialEntries={["/characters/x?tab=spells"]}>
      <TabsProvider>
        <PlayRefDeepLink />
        <TabParam />
        {/* A stub target with the section's header anchor id (the real header lives
            in the Combat panel, which isn't mounted in this thin harness). */}
        <div id={PLAY_REF_ANCHOR.rules} />
      </TabsProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  useUIStore.setState({ pendingPlayRef: null, playRefSections: {} });
});

describe("PlayRefDeepLink", () => {
  it("switches to Combat, opens the section, scrolls it in, and clears the request", async () => {
    setup();
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView");
    // A palette request lands.
    act(() => {
      useUIStore.setState({ pendingPlayRef: "rules" });
    });
    // Immediate: the Combat tab is selected (mirrored to `?tab=`) + the section opens.
    await waitFor(() => expect(screen.getByTestId("tab").textContent).toBe("combat"));
    expect(useUIStore.getState().playRefSections.rules).toBe(true);
    // rAF-scheduled: the header is scrolled into view and the request is cleared.
    await waitFor(() => expect(useUIStore.getState().pendingPlayRef).toBeNull());
    expect(scrollSpy).toHaveBeenCalled();
    scrollSpy.mockRestore();
  });

  it("does nothing while idle (no pending request)", () => {
    setup();
    expect(screen.getByTestId("tab").textContent).toBe("spells");
    expect(useUIStore.getState().playRefSections).toEqual({});
  });
});
