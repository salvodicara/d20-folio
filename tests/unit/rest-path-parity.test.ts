vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
/**
 * Mechanics-world retirement, slice 5: the RestModal's world rest
 * (`restThroughWorld`) and the sheet's own rest (`shortRest`/`longRest`) must
 * leave the same sheet. Every dev scenario is worn down (HP, a spent slot and
 * tracker, exhaustion) and rested both ways; the sessions are compared without
 * the world itself and the log's generated ids.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";

import { restThroughWorld } from "@/features/character/rest-world-boundary";
import { buildDevScenario, DEV_SCENARIOS } from "@/lib/dev-scenarios";
import { characterTrackerSeeds, characterWorldState } from "@/lib/mechanics-world-store";
import { resolveTrackers } from "@/lib/smart-tracker";
import { useAuthStore } from "@/stores/authStore";
import { useCharacterStore } from "@/stores/characterStore";
import type { CharacterDoc } from "@/types/character";

const UID = "test-uid";

/** A scenario worn down by play, carrying a persisted world. */
function wornDown(id: string): CharacterDoc | null {
  const doc = buildDevScenario(id);
  if (!doc) return null;
  const slot = doc.character.spellSlots.find((s) => s.total > 0);
  const tracker = resolveTrackers(doc).find((t) => t.total > 0);
  const worn: CharacterDoc = {
    ...doc,
    session: {
      ...doc.session,
      hp: { current: Math.max(1, Math.floor(doc.character.hp.max / 2)), temp: 0 },
      exhaustion: 2,
      ...(slot
        ? { spellSlots: { ...doc.session.spellSlots, [String(slot.level)]: { used: 1 } } }
        : {}),
      ...(tracker
        ? { trackers: { ...doc.session.trackers, [tracker.id]: { used: 1 } } }
        : {}),
      logEntries: [],
    },
  };
  const world = characterWorldState(
    worn,
    UID,
    worn.character.hp.max,
    {},
    characterTrackerSeeds(worn)
  );
  return world
    ? { ...worn, session: { ...worn.session, world: structuredClone(world) } }
    : null;
}

function load(doc: CharacterDoc): void {
  useCharacterStore.setState({
    character: structuredClone(doc),
    loading: false,
    error: null,
    readonly: false,
    combatPersistence: null,
    combatPendingConcentrationSaves: [],
  });
}

/** The sheet as a player sees it: no world, the log as its kinds. */
function sheet(): unknown {
  const doc = useCharacterStore.getState().character;
  if (!doc) throw new Error("no character");
  const { world: _world, logEntries, ...session } = doc.session;
  void _world;
  return {
    session: { ...session, logKinds: logEntries.map((e) => e.event.kind) },
    equipment: doc.character.equipment,
  };
}

afterEach(() => useAuthStore.setState({ user: null }));

const ids = Object.keys(DEV_SCENARIOS);

describe.each(["long", "short"] as const)(
  "a %s rest leaves the same sheet both ways",
  (kind) => {
    it.each(ids)("%s", (id) => {
      const doc = wornDown(id);
      if (!doc) return;
      useAuthStore.setState({ user: { uid: UID } as User });
      load(doc);
      const path = restThroughWorld(kind);
      const viaWorld = sheet();

      useAuthStore.setState({ user: null });
      load(doc);
      const store = useCharacterStore.getState();
      if (kind === "long") store.longRest();
      else store.shortRest();
      const viaSheet = sheet();

      expect(path).toBe("engine");
      expect(viaWorld).toEqual(viaSheet);
    });
  }
);
