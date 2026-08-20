/** ResourceRail exact-dawn regression for a physical typed-item counter. */
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
  const character = buildScenario(spec);
  const wand = character.character.equipment.find(
    (entry) => !("custom" in entry) && entry.srdId === "wand-of-web"
  );
  if (!wand || "custom" in wand) throw new Error("scenario wand missing");
  wand.instanceId = "wand-web-rail-copy";
  character.session.itemResources = {
    "wand-web-rail-copy": {
      itemId: "wand-of-web",
      instanceId: "wand-web-rail-copy",
      revision: 0,
      resources: { charges: { capacity: 7, current: 5, disabled: false } },
      disposition: "magical",
      causalHead: null,
    },
  };
  useCharacterStore.setState({
    character,
    loading: false,
    error: null,
  });
}

describe("ResourceRail — exact dawn item recovery", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
    useUIStore.setState({ sheetMode: "play" });
  });

  it("renders dawn without aliasing the physical Wand of Web pool to LR", () => {
    loadWandBearer();
    render(
      <MemoryRouter>
        <ResourceRail />
      </MemoryRouter>
    );

    const poolName = screen.getByText("Wand of Web · Charges");
    const row = poolName.closest(".trk");
    expect(row).not.toBeNull();
    const badge = within(row as HTMLElement).getByText(
      i18n.getFixedT("en")("combat.resourceRecoveryDawn")
    );
    expect(badge).toHaveAttribute("data-r", "dawn");
    expect(row).not.toHaveTextContent(i18n.getFixedT("en")("features.recoverLongBadge"));
  });
});
