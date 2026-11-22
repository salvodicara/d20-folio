/**
 * What the open sheet knows about its campaign's fight, in three states (the engine
 * and rules lanes' contract, 2026-11-22):
 *   - settled: the campaigns are read for C, and either the fight's live status is for
 *     C or no pip entry lists C;
 *   - pending: a reader is mounted and has not answered, or a pip entry lists C
 *     without its status;
 *   - no reader (no shell mounted, or the dev bypass): settled at once, never waited on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase", () => ({}));

import { fightContext, fightSettledSoon } from "@/features/campaigns/context-settled";
import {
  useCombatStatusStore,
  type GlobalCombat,
  type PipModel,
} from "@/features/campaigns/global-combat-context";
import { usePartyRosterStore } from "@/features/campaigns/party-roster";

const C = "char-1";

const pip = (characterId: string): PipModel => ({
  primaryId: "camp-1",
  entries: [
    {
      campaignId: "camp-1",
      campaignName: "Campaign",
      role: "pc",
      state: "your-turn",
      round: 1,
      heroName: "Hero",
      characterId,
      actorName: null,
    },
  ],
});
const status = (characterId: string) => ({ characterId }) as unknown as GlobalCombat;

afterEach(() => {
  vi.useRealTimers();
  usePartyRosterStore.setState({
    party: null,
    resolvedFor: null,
    castWaiting: null,
    readerMounted: false,
  });
  useCombatStatusStore.setState({ status: null, pip: null });
});

describe("fightContext", () => {
  it("no reader mounted: settled at once, even with nothing read", () => {
    expect(fightContext(C)).toBe("settled");
  });

  it("a reader mounted that has not read the campaigns: pending", () => {
    usePartyRosterStore.getState().setReaderMounted(true);
    expect(fightContext(C)).toBe("pending");
  });

  it("campaigns read and no campaign lists a fight for C: settled", () => {
    usePartyRosterStore.getState().setReaderMounted(true);
    usePartyRosterStore.getState().setParty(null, C);
    useCombatStatusStore.setState({ pip: pip("someone-else") });
    expect(fightContext(C)).toBe("settled");
  });

  it("campaigns read, the pip lists C's fight, its status not here: pending", () => {
    usePartyRosterStore.getState().setReaderMounted(true);
    usePartyRosterStore.getState().setParty(null, C);
    useCombatStatusStore.setState({ pip: pip(C) });
    expect(fightContext(C)).toBe("pending");
    // Even with no reader flag: a listed fight without its status is never settled.
    usePartyRosterStore.getState().setReaderMounted(false);
    expect(fightContext(C)).toBe("pending");
  });

  it("the fight's status for C has arrived: settled", () => {
    usePartyRosterStore.getState().setReaderMounted(true);
    usePartyRosterStore.getState().setParty(null, C);
    useCombatStatusStore.setState({ pip: pip(C), status: status(C) });
    expect(fightContext(C)).toBe("settled");
  });
});

describe("fightSettledSoon", () => {
  it("resolves true once the status arrives", async () => {
    usePartyRosterStore.getState().setReaderMounted(true);
    usePartyRosterStore.getState().setParty(null, C);
    useCombatStatusStore.setState({ pip: pip(C) });
    const settled = fightSettledSoon(C);
    useCombatStatusStore.setState({ status: status(C) });
    await expect(settled).resolves.toBe(true);
  });

  it("resolves false after the one wait (4 s) when nothing answers", async () => {
    vi.useFakeTimers();
    usePartyRosterStore.getState().setReaderMounted(true);
    const settled = fightSettledSoon(C);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(settled).resolves.toBe(false);
  });

  it("the shell's two writes (the party, then the pip) never settle it in between", async () => {
    usePartyRosterStore.getState().setReaderMounted(true);
    let settled: boolean | undefined;
    void fightSettledSoon(C).then((value) => {
      settled = value;
    });
    // One pass: the party effect, then the pip effect.
    usePartyRosterStore.getState().setParty(null, C);
    useCombatStatusStore.setState({ pip: pip(C) });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBeUndefined();
    useCombatStatusStore.setState({ status: status(C) });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(true);
  });

  it("resolves true at once with no reader", async () => {
    await expect(fightSettledSoon(C)).resolves.toBe(true);
  });
});
