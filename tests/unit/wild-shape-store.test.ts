/**
 * Wild Shape through the store (edge-case family M2): a class feature, not a spell,
 * so assuming the form leaves the druid's Concentration alone, and its Temporary HP
 * (Druid level) stay after reverting.
 */
import { afterEach, describe, expect, it } from "vitest";
import { concentrationValue } from "@/lib/concentration";
import { buildDevScenario } from "@/lib/dev-scenarios";
import { useCharacterStore } from "@/stores/characterStore";
import { useToastStore } from "@/stores/toastStore";

function druid() {
  const doc = buildDevScenario("potent-druid");
  if (!doc) throw new Error("the potent-druid scenario is missing");
  return doc;
}

describe("the store: Wild Shape", () => {
  afterEach(() => {
    useCharacterStore.getState().setCharacter(null);
    useToastStore.setState({ toasts: [] });
  });

  it("keeps the druid's Concentration on another spell", () => {
    const doc = druid();
    doc.session.concentration = concentrationValue("barkskin");
    useCharacterStore.getState().setCharacter(doc);
    useCharacterStore.getState().assumePolymorphForm("wolf", "druid-wild-shape");
    const after = useCharacterStore.getState().character;
    expect(after?.session.activeForm?.beastId).toBe("wolf");
    expect(after?.session.concentration).toBe(concentrationValue("barkskin"));
  });

  it("gives Temporary HP equal to the Druid level, which stay after reverting", () => {
    useCharacterStore.getState().setCharacter(druid());
    useCharacterStore.getState().assumePolymorphForm("wolf", "druid-wild-shape");
    expect(useCharacterStore.getState().character?.session.hp.temp).toBe(7);
    useCharacterStore.getState().dropPolymorphForm();
    const after = useCharacterStore.getState().character;
    expect(after?.session.activeForm).toBeUndefined();
    expect(after?.session.hp.temp).toBe(7);
  });
});
