/**
 * Local development (auth bypass): a combat lifecycle move must land in the campaign's
 * local replica too, not only in the screen's store. Otherwise the next replica emit
 * (any other local campaign write, e.g. the encounter's debounced save) brings back the
 * old `encounterInit` and the rolls vanish from the list (seen in the campaign video:
 * after «Tira per chi manca» and one pass, every character read «deve tirare» again).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dev-bypass", () => ({ DEV_BYPASS_AUTH: true }));
vi.mock("@/lib/firebase", () => ({ db: {} }));

import { rollForMissing } from "@/features/campaigns/combat-lifecycle-io";
import { useCampaignStore } from "@/features/campaigns/campaignStore";
import { readDevDocument } from "@/lib/dev-document-store";
import type { CampaignDoc } from "@/types/campaign";

const member = (characterId: string) => ({
  displayName: characterId,
  role: "player" as const,
  characterId,
  character: { name: characterId },
});

beforeEach(() => {
  useCampaignStore.setState({
    campaign: {
      id: "camp",
      dmUid: "dm",
      members: ["dm", "ana", "ben"],
      memberDetails: {
        dm: { displayName: "dm", role: "dm", characterId: null },
        ana: member("c-ana"),
        ben: member("c-ben"),
      },
      encounter: null,
      encounterInit: {},
      treasury: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      treasuryLog: [],
    } as unknown as CampaignDoc,
  });
});

describe("lifecycle moves under dev bypass", () => {
  it("write the same rolls into the local replica as into the screen", async () => {
    const undo = await rollForMissing(
      "camp",
      { uid: "dm", bonuses: { "pc-ana": 2, "pc-ben": 1 } },
      () => 10
    );
    expect(undo).not.toBeNull();
    const shown = useCampaignStore.getState().campaign?.encounterInit;
    expect(shown).toEqual({ ana: 10, ben: 10 });
    expect(readDevDocument<CampaignDoc>("campaign", "camp")?.encounterInit).toEqual(
      shown
    );
  });
});
