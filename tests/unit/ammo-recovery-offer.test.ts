/**
 * After a fight, a minute spent searching the battlefield brings back half the
 * ammunition used (SRD 5.2.1 Ammunition). The offer is the same wherever the fight
 * ends: a campaign encounter (GlobalCombatMount) or a solo fight's «End combat».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));

import { offerAmmunitionRecovery } from "@/features/character/ammo-recovery-offer";
import { MOCK_CHARACTER } from "@/lib/mock";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";
import i18n from "i18next";

describe("offerAmmunitionRecovery", () => {
  beforeEach(() => useToastStore.setState({ toasts: [] }));
  const t = i18n.getFixedT("en");

  it("offers half the spent pieces back, and recovering dispatches the recovery", () => {
    const dispatch = vi.fn(() => () => undefined);
    useCharacterStore.setState({
      character: {
        ...MOCK_CHARACTER,
        session: { ...MOCK_CHARACTER.session, ammoSpent: { arrows: 7 } },
      },
      dispatch,
    });
    expect(offerAmmunitionRecovery(t)).toBe(true);
    const toast = useToastStore.getState().toasts[0];
    expect(String(toast?.message)).toMatch(/3/);
    toast?.action?.run();
    expect(dispatch).toHaveBeenCalledWith({ kind: "recover-ammunition" });
  });

  it("says nothing when nothing would come back", () => {
    useCharacterStore.setState({
      character: {
        ...MOCK_CHARACTER,
        session: { ...MOCK_CHARACTER.session, ammoSpent: { arrows: 1 } },
      },
    });
    expect(offerAmmunitionRecovery(t)).toBe(false);
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});
