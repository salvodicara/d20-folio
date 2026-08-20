vi.mock("@/lib/firebase", () => ({
  app: {},
  auth: {},
  db: {},
  functions: {},
  storage: {},
}));
/**
 * Engine-held concentration coherence at the legacy break boundaries.
 *
 * An engine cast records concentration as a WORLD occurrence and mirrors it
 * onto `session.concentration`. These tests pin the two directions of the
 * coherence contract:
 *
 * 1. A legacy authoritative break (the entered-d20 failed save, the manual
 *    stop, a legacy swap) ENDS the engine occurrence through the canonical
 *    kernel end machinery in the same motion — afterwards neither the world
 *    nor the session holds the spell, and the buff's standing (Blur's
 *    incoming-attack-disadvantage) is gone with its source. The entered-d20
 *    undo restores both sides; the manual-stop undo reverses the exact
 *    journal action.
 *
 * 2. The commit mirror moves `session.concentration` ONLY on engine
 *    transitions: a commit that leaves the engine concentration unchanged can
 *    never clobber a legacy-held swap back (no resurrection), and after a
 *    break no later commit re-mirrors the ended spell (no zombie).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { concentrationValue } from "@/lib/concentration";
import { runMechanicsCausalAction } from "@/lib/mechanics-coordinator";
import { beginMechanicsCausalState } from "@/lib/mechanics-world";
import {
  boundaryCommitFacts,
  characterMaterialRef,
  characterSelfRef,
  characterSlotDefinitionFacts,
  characterSpellCapability,
  characterWorldState,
  commitCharacterAction,
  engineConcentrationHandle,
  mechanicsAuthorityDefinition,
  persistedWorldUid,
  planEngineConcentrationEnd,
  type CharacterCastCapability,
} from "@/lib/mechanics-world-store";
import { worldStandingActiveKeys } from "@/lib/world-standing-grants";
import { useCharacterStore } from "@/stores/characterStore";
import { useUndoStore } from "@/stores/undoStore";
import type { CharacterDoc } from "@/types/character";
import type { CharacterMaterialState } from "@/types/material-state";
import type { MechanicsAnswer } from "@/types/mechanics-program";

import { makeCharacterDoc } from "./_helpers";

const UID = "test-uid";

function wizardDoc(): CharacterDoc {
  const doc = makeCharacterDoc({ classId: "wizard", level: 5 });
  doc.character.spells = [
    { srdId: "blur", prepared: true },
    { srdId: "shield", prepared: true },
  ];
  doc.character.spellSlots = [
    { level: 1, total: 2 },
    { level: 2, total: 2 },
  ];
  doc.session.spellSlots = {};
  doc.session.concentration = "";
  return doc;
}

/** Drive one spell capability to a planned action (the replay protocol). */
function drive(
  doc: Readonly<CharacterDoc>,
  world: Readonly<CharacterMaterialState>,
  capability: CharacterCastCapability,
  actionId: string,
  slotLevel: number
) {
  const material = characterMaterialRef(doc, UID);
  const self = characterSelfRef(doc, UID);
  const begun = beginMechanicsCausalState({
    documents: [{ kind: "character", material, state: world }],
    scope: material,
  });
  if (!begun.ok) throw new Error(`begin: ${begun.reason}`);
  const answers: MechanicsAnswer[] = [];
  const run = () =>
    runMechanicsCausalAction({
      answers,
      authoritySnapshot: {
        definitions: [mechanicsAuthorityDefinition(capability.authority)],
      },
      facts: [...capability.facts, ...characterSlotDefinitionFacts(doc, UID, world)],
      frameAnswers: [],
      intent: {
        actionId,
        factGuards: [],
        frame: {
          authority: capability.authority,
          invocation: {
            installation: capability.authority.installation,
            kind: "installed-capability",
          },
          rootReceipt: {
            kind: "create",
            materialEpoch: world.epoch,
            next: { execution: 1, phaseId: "resolve", triggerEventId: null },
            root: {
              occurrence: { material, occurrenceId: `${actionId}-root` },
              ordinal: world.nextOccurrenceOrdinal,
            },
          },
          trigger: { kind: "invocation" },
        },
      },
      responses: [],
      state: begun.value,
      turnEconomy: [],
    });
  let outcome = run();
  for (let remaining = 8; outcome.status === "needs-answer" && remaining > 0; ) {
    const requirement = outcome.requirement;
    if (!requirement) throw new Error("missing requirement");
    if (requirement.kind === "resource") {
      answers.push({
        inputId: requirement.inputId,
        kind: "resource",
        resource: { character: material, kind: "standard-spell-slot", level: slotLevel },
      });
    } else if (requirement.kind === "entities") {
      answers.push({ inputId: requirement.inputId, kind: "entities", targets: [self] });
    } else {
      throw new Error(`unexpected requirement: ${requirement.kind}`);
    }
    outcome = run();
    remaining -= 1;
  }
  if (outcome.status !== "complete" || !outcome.action) {
    throw new Error(`${actionId}: ${JSON.stringify(outcome).slice(0, 400)}`);
  }
  return outcome.action;
}

function commit(
  doc: Readonly<CharacterDoc>,
  world: Readonly<CharacterMaterialState>,
  action: ReturnType<typeof drive>
) {
  const committed = commitCharacterAction(
    doc,
    UID,
    world,
    action,
    boundaryCommitFacts(action)
  );
  if (!committed) throw new Error("commit failed");
  return committed;
}

/** Engine-cast Blur onto a fresh doc: world concentration + standing + mirror. */
function docWithEngineBlur(): CharacterDoc {
  const doc = wizardDoc();
  const world = characterWorldState(doc, UID, doc.character.hp.max);
  if (!world) throw new Error("world fixture");
  const capability = characterSpellCapability(doc, UID, "blur", {
    attackBonus: 5,
    castingModifier: 3,
    characterLevel: 5,
    maxHp: doc.character.hp.max,
    saveDc: 13,
  });
  if (!capability) throw new Error("blur capability");
  const cast = commit(doc, world, drive(doc, world, capability, "cast-blur", 2));
  expect(cast.session.concentration).toBe("blur");
  return { ...doc, session: cast.session };
}

function liveWorld(doc: Readonly<CharacterDoc>): Readonly<CharacterMaterialState> {
  const world = characterWorldState(doc, UID, doc.character.hp.max);
  if (!world) throw new Error("world reparse");
  return world;
}

function loadStore(doc: CharacterDoc): void {
  useCharacterStore.setState({
    character: doc,
    loading: false,
    error: null,
    readonly: false,
    combatPersistence: null,
    combatPendingConcentrationSaves: [],
  });
}

beforeEach(() => {
  useUndoStore.getState().clear(null);
});

describe("failed concentration save (the entered-d20 flow)", () => {
  it("ends the engine occurrence and clears the session in one motion, undo restores both", () => {
    const doc = docWithEngineBlur();
    expect(engineConcentrationHandle(liveWorld(doc))?.spellId).toBe("blur");
    expect([...worldStandingActiveKeys(doc.session.world)]).toContain("spell-blur");
    loadStore(doc);

    const store = useCharacterStore.getState();
    store.queueConcentrationSaveForDamage(10);
    const pending = useCharacterStore.getState().combatPendingConcentrationSaves[0];
    expect(pending).toBeDefined();
    if (!pending) return;
    expect(pending.spell).toBe("blur");

    // An entered natural 1 fails the DC 10 save: the authoritative teardown
    // must end BOTH sides — the session field AND the world occurrence (with
    // the standing it sourced).
    const committed = store.commitPendingConcentrationSave(pending, [1]);
    expect(committed).not.toBeNull();
    if (!committed) return;
    expect(committed.result.reviewedOutcome.status).toBe("failure");
    const after = useCharacterStore.getState().character;
    expect(after).not.toBeNull();
    if (!after) return;
    expect(after.session.concentration).toBe("");
    expect(engineConcentrationHandle(liveWorld(after))).toBeNull();
    expect(worldStandingActiveKeys(after.session.world).size).toBe(0);

    // No zombie: a later engine commit (a Shield cast) never re-mirrors the
    // ended spell back onto the session.
    const world = liveWorld(after);
    const shield = characterSpellCapability(after, UID, "shield", {
      attackBonus: 5,
      castingModifier: 3,
      characterLevel: 5,
      maxHp: after.character.hp.max,
      saveDc: 13,
    });
    if (!shield) throw new Error("shield capability");
    const next = commit(after, world, drive(after, world, shield, "cast-shield", 1));
    expect(next.session.concentration).toBe("");

    // The entered-d20 undo restores the exact pre-save snapshot: the world
    // occurrence, its standing, and the session field return together.
    expect(committed.undo()).toBe(true);
    const restored = useCharacterStore.getState().character;
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.session.concentration).toBe("blur");
    expect(engineConcentrationHandle(liveWorld(restored))?.spellId).toBe("blur");
    expect([...worldStandingActiveKeys(restored.session.world)]).toContain("spell-blur");
  });
});

describe("legacy authoritative drops of an engine-held spell", () => {
  it("manual stop ends the engine occurrence; undo reverses the exact journal action", () => {
    const doc = docWithEngineBlur();
    loadStore(doc);

    useCharacterStore.getState().setConcentration("");
    const after = useCharacterStore.getState().character;
    expect(after).not.toBeNull();
    if (!after) return;
    expect(after.session.concentration).toBe("");
    expect(engineConcentrationHandle(liveWorld(after))).toBeNull();
    expect(worldStandingActiveKeys(after.session.world).size).toBe(0);

    // The registered undo reverses the engine end (the canonical journal
    // reverse) alongside the legacy field restore.
    expect(useUndoStore.getState().past.length).toBeGreaterThan(0);
    useUndoStore.getState().undo();
    const restored = useCharacterStore.getState().character;
    expect(restored).not.toBeNull();
    if (!restored) return;
    expect(restored.session.concentration).toBe("blur");
    expect(engineConcentrationHandle(liveWorld(restored))?.spellId).toBe("blur");
    expect([...worldStandingActiveKeys(restored.session.world)]).toContain("spell-blur");
  });

  it("a legacy swap to another spell ends the engine occurrence and keeps the new spell", () => {
    const doc = docWithEngineBlur();
    loadStore(doc);

    useCharacterStore
      .getState()
      .setConcentration(concentrationValue("bless"), { silent: true });
    const after = useCharacterStore.getState().character;
    expect(after).not.toBeNull();
    if (!after) return;
    expect(after.session.concentration).toBe("bless");
    expect(engineConcentrationHandle(liveWorld(after))).toBeNull();
    expect(worldStandingActiveKeys(after.session.world).size).toBe(0);
  });
});

describe("the transitions-only concentration mirror", () => {
  it("an unchanged engine concentration never clobbers a diverged legacy field", () => {
    const doc = docWithEngineBlur();
    // Simulate a legacy-held swap the mirror must respect: the session points
    // at another spell while the engine occurrence still lives.
    const swapped: CharacterDoc = {
      ...doc,
      session: { ...doc.session, concentration: concentrationValue("bless") },
    };
    const world = liveWorld(swapped);
    const shield = characterSpellCapability(swapped, UID, "shield", {
      attackBonus: 5,
      castingModifier: 3,
      characterLevel: 5,
      maxHp: swapped.character.hp.max,
      saveDc: 13,
    });
    if (!shield) throw new Error("shield capability");
    const next = commit(swapped, world, drive(swapped, world, shield, "cast-shield", 1));
    // The engine concentration did not transition, so the field keeps the
    // legacy-held value — no resurrection of "blur".
    expect(next.session.concentration).toBe("bless");
    expect(engineConcentrationHandle(next.world)?.spellId).toBe("blur");
  });
});

describe("planEngineConcentrationEnd (the canonical end action)", () => {
  it("ends the root, the concentration effect, and every sourced standing in one wave", () => {
    const doc = docWithEngineBlur();
    const world = liveWorld(doc);
    const uid = persistedWorldUid(doc.session.world);
    expect(uid).toBe(UID);
    const action = planEngineConcentrationEnd(doc, UID, world, "break-1");
    expect(action).not.toBeNull();
    if (!action) return;
    const committed = commit(doc, world, action);
    expect(engineConcentrationHandle(committed.world)).toBeNull();
    expect(worldStandingActiveKeys(committed.session.world).size).toBe(0);
    expect(committed.session.concentration).toBe("");
  });

  it("returns null when the world holds no engine concentration", () => {
    const doc = wizardDoc();
    const world = characterWorldState(doc, UID, doc.character.hp.max);
    if (!world) throw new Error("world fixture");
    expect(planEngineConcentrationEnd(doc, UID, world, "break-none")).toBeNull();
  });
});
