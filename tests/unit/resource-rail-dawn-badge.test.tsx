/**
 * ResourceRail dawn-recharge badge — the anti-divergence regression (DEFECT 2).
 *
 * The bug: `RailTracker` mapped a `dawn` recovery to NO badge, while the Features
 * tab (`FeaturesTab`'s `trackerRecovery`) mapped `dawn` → a Long-Rest chip. They
 * disagreed about the SAME fact for a magic-item dawn pool (an equipped charged
 * wand's daily charges). Per the app's play model a Long Rest resets dawn pools,
 * so `dawn` folds to Long Rest on every on-screen surface.
 *
 * The fix routes BOTH surfaces through the ONE shared `trackerRecoveryBadgeBucket`
 * classifier (pinned exhaustively in `tracker-view.test.ts`: `dawn` → the "long"
 * bucket, the same bucket `long-rest` maps to), so they agree by construction and
 * can never re-diverge (golden rule 6). This renders the surface that was BROKEN —
 * the rail — with a real equipped charged wand (Wand of Web, a 7-charge dawn pool)
 * and asserts its row now carries the Long-Rest badge (fails before, passes after).
 *
 * Firebase is mocked (the rail reaches store/engine code that may import it
 * transitively) to keep the render CI-pure.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";

vi.mock("@/lib/firebase", () => ({}));

import i18n from "@/i18n";
import { ResourceRail } from "@/features/character/molecules/ResourceRail";
import { useCharacterStore } from "@/stores/characterStore";
import { useUIStore } from "@/stores/uiStore";
import { buildScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";

function loadWandBearer() {
  const spec = DEV_SCENARIOS["wand-of-web-fighter"];
  if (!spec) throw new Error("missing dev scenario: wand-of-web-fighter");
  useCharacterStore.setState({
    character: buildScenario(spec),
    loading: false,
    error: null,
  });
}

describe("ResourceRail — a dawn-recharge pool shows the Long-Rest badge", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useUIStore.setState({ sheetMode: "play" });
  });

  it("renders the LR badge on the Wand of Web dawn pool (DEFECT-2 regression)", () => {
    loadWandBearer();
    render(
      <MemoryRouter>
        <ResourceRail />
      </MemoryRouter>
    );

    // The item charge pool row is labelled by the magic item's own name.
    const poolName = screen.getByText("Wand of Web");
    const row = poolName.closest(".trk");
    expect(row).not.toBeNull();
    // fail-before: `dawn` mapped to null → the `{recoveryLabel && …}` chip never
    // rendered. Now the shared classifier yields the "long" bucket → the LR badge.
    const badge = within(row as HTMLElement).getByText(
      i18n.getFixedT("en")("features.recoverLongBadge")
    );
    expect(badge).toHaveAttribute("data-r", "long");
  });
});
